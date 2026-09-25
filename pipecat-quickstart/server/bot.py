#
# Copyright (c) 2024–2025, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""pipecat-quickstart - Pipecat Voice Agent

This bot uses a cascade pipeline: Speech-to-Text → LLM → Text-to-Speech

Required AI services:
- ElevenLabs (Speech-to-Text)
- Anthropic (LLM)
- ElevenLabs (Text-to-Speech)

Run the bot using::

    uv run bot.py
"""

import os

import aiohttp

from dotenv import load_dotenv
from loguru import logger
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.services.elevenlabs.stt import ElevenLabsSTTService
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
from pipecat.services.anthropic.llm import AnthropicLLMService
from pipecat.transports.base_transport import BaseTransport, TransportParams
from pipecat.transports.daily.transport import DailyParams
from pipecat.workers.runner import WorkerRunner

load_dotenv(override=True) 

from supabase import create_client

supabase = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY"),
)

CURRENT_LANGUAGE = "en"  # change to "fr" to test French 

LANGUAGE_CONFIG = {
    "en": {
        "stt_language": "en",
        "system_prompt": (
            "You're {friend_name}, a friend around {age_range} years old, "
            "talking to someone out loud in English. This isn't a lesson — "
            "it's a real conversation between friends.\n\n"
            "TONE AND STYLE\n"
            "- Be casual and natural, like talking to a peer, not an assistant.\n"
            "- Occasionally mix in slang appropriate to your age. If the person "
            "seems confused by an expression, explain it briefly and naturally "
            "without breaking character.\n"
            "- Your responses will be spoken aloud: no emojis, no bullet "
            "points, nothing that can't be said out loud.\n\n"
            "PERSONALITY\n"
            "- You have your own tastes and opinions, but never push them. "
            "For example: \"Hmm, I've never thought about it that way, I "
            "usually see it more like...\" or \"I don't really watch action "
            "movies, I'm more into comedy, but tell me why you like it.\"\n"
            "- Stay genuinely curious about what the other person cares "
            "about, without ever implying your take is the only valid one.\n\n"
            "CORRECTIONS\n"
            "- Never explicitly correct a mistake. If the person makes one, "
            "just naturally work the correct version into your own reply, "
            "the way a friend would, without ever stopping to point it out."
        ),
    },
    "fr": {
        "stt_language": "fr",
        "system_prompt": (
            "Tu es {friend_name}, un(e) ami(e) d'environ {age_range} ans qui "
            "discute avec quelqu'un à l'oral, en français. Ce n'est pas un "
            "cours : c'est une vraie conversation entre amis.\n\n"
            "TON ET STYLE\n"
            "- Sois décontracté(e) et naturel(le), comme on parle à un(e) "
            "pote, pas comme un assistant. Utilise \"tu\", pas \"vous\".\n"
            "- Mélange occasionnellement de l'argot ou des expressions "
            "familières adaptées à ton âge. Si la personne ne semble pas "
            "comprendre une expression, explique-la brièvement et "
            "naturellement, sans sortir du personnage.\n"
            "- Tes réponses seront lues à voix haute : pas d'émojis, pas de "
            "listes à puces, rien qui ne se prononce pas.\n\n"
            "PERSONNALITÉ\n"
            "- Tu as tes propres goûts et opinions, mais tu ne les imposes "
            "jamais. Par exemple : \"Hmm, je n'avais jamais pensé à ça comme "
            "ça, moi je vois plutôt les choses comme ça...\" ou \"Je regarde "
            "plutôt des comédies que des films d'action, mais raconte-moi "
            "pourquoi t'aimes ça.\"\n"
            "- Sois curieux(se) de ce qui intéresse l'autre personne, sans "
            "jamais donner l'impression que ta façon de voir les choses est "
            "la seule valable.\n\n"
            "CORRECTIONS\n"
            "- Ne corrige jamais explicitement une erreur. Si la personne "
            "fait une erreur, reformule naturellement la bonne version dans "
            "ta propre réponse, comme le ferait un ami, sans jamais "
            "s'arrêter pour signaler l'erreur."
        ),
    },
}



from fastapi import Request
from pipecat.runner.run import app

PERSONA_CONFIG = {
    "fr": {
        "female": {"name": "Margot", "voice_id": os.getenv("ELEVENLABS_VOICE_ID_MARGOT")},
        "male": {"name": "Philippe", "voice_id": os.getenv("ELEVENLABS_VOICE_ID_PHILIPPE")},
    },
    "en": {
        "female": {"name": "Maya", "voice_id": os.getenv("ELEVENLABS_VOICE_ID_MAYA")},
        "male": {"name": "Theo", "voice_id": os.getenv("ELEVENLABS_VOICE_ID_THEO")},
    },
}

CURRENT_GENDER = "male"  # default; real onboarding will set this later


@app.post("/set-persona")
async def set_persona(request: Request):
    """Let the frontend choose which friend persona the next session should use."""
    global CURRENT_GENDER
    data = await request.json()
    gender = data.get("gender")
    if gender in ("female", "male"):
        CURRENT_GENDER = gender
    return {"gender": CURRENT_GENDER}
@app.post("/set-language")
async def set_language(request: Request):
    """Let the frontend choose which language the next session should use."""
    global CURRENT_LANGUAGE
    data = await request.json()
    lang = data.get("language")
    if lang in LANGUAGE_CONFIG:
        CURRENT_LANGUAGE = lang
    return {"language": CURRENT_LANGUAGE}




async def run_bot(transport: BaseTransport, runner_args: RunnerArguments) -> None:
    """Run the voice bot for this session."""
    logger.info("Starting bot")

    aiohttp_session = aiohttp.ClientSession()

    lang = LANGUAGE_CONFIG[CURRENT_LANGUAGE] 

    persona = PERSONA_CONFIG[CURRENT_LANGUAGE][CURRENT_GENDER]


    # Speech-to-Text service (ElevenLabs Scribe)
    stt = ElevenLabsSTTService(
        api_key=os.getenv("ELEVENLABS_API_KEY"),
        aiohttp_session=aiohttp_session,
        language=lang["stt_language"],
    )

    # Text-to-Speech service (ElevenLabs)
    tts = ElevenLabsTTSService(
        api_key=os.getenv("ELEVENLABS_API_KEY"),
        voice_id=persona["voice_id"],
    )

    # LLM service (Claude)
    llm = AnthropicLLMService(
        api_key=os.getenv("ANTHROPIC_API_KEY"),
        settings=AnthropicLLMService.Settings(
            model="claude-sonnet-4-6",
            system_instruction=lang["system_prompt"].format(
    friend_name=persona["name"],
    age_range="18-24",
),
        ),
    )

    context = LLMContext()
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(vad_analyzer=SileroVADAnalyzer()),
    )

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            user_aggregator,
            llm,
            tts,
            transport.output(),
            assistant_aggregator,
        ]
    )

    worker = PipelineWorker(
        pipeline,
        params=PipelineParams(
            enable_metrics=True,
            enable_usage_metrics=True,
        ),
        observers=[],
    )

    @worker.rtvi.event_handler("on_client_ready")
    async def on_client_ready(rtvi):
        context.add_message(
            {"role": "developer", "content": "Start by concisely introducing yourself."}
        )
        await worker.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info("Client connected")

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info("Client disconnected")
        try:
            supabase.table("sessions").insert({
                "language": CURRENT_LANGUAGE,
                 "transcript": context.messages,
            }).execute()
        except Exception as e:
            logger.error(f"Failed to save session to Supabase: {e}")
        await worker.cancel()

    runner = WorkerRunner(handle_sigint=False)

    await runner.add_workers(worker)
    await runner.run()


async def bot(runner_args: RunnerArguments):
    """Main bot entry point."""

    transport_params = {
        "daily": lambda: DailyParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
        ),
        "webrtc": lambda: TransportParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
        ),
    }

    transport = await create_transport(runner_args, transport_params)

    await run_bot(transport, runner_args)


if __name__ == "__main__":
    from pipecat.runner.run import main

    main()