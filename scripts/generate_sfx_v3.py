import requests
import os
import time

api_key = os.environ.get("ELEVENLABS_API_KEY")
if not api_key:
    raise RuntimeError("Set ELEVENLABS_API_KEY before running this script.")

url = "https://api.elevenlabs.io/v1/sound-generation"

headers = {
    "Accept": "audio/mpeg",
    "Content-Type": "application/json",
    "xi-api-key": api_key
}

sfx_prompts = {
    "bomb_place.mp3": {
        "text": "arcade menu select, sci-fi interface click, heavy metallic clank, futuristic lock-in sound, clean, isolated, synthetic, high quality, short",
        "duration": 0.5
    },
    "bomb_explode.mp3": {
        "text": "synthetic bass blast, futuristic energy burst explosion, punchy low-end, clean sci-fi detonation impact, loud, dry",
        "duration": 1.5
    },
    "flame_ignite.mp3": {
        "text": "fast energetic fire whoosh, laser beam burn, sharp electric crackle, energetic plasma burst, clean, dry, snappy",
        "duration": 1.0
    },
    "crate_break.mp3": {
        "text": "heavy wooden crate shattering, sharp wood splintering crack, clean impact, dry tone",
        "duration": 1.0
    },
    "player_death.mp3": {
        "text": "retro robot power down, descending synth glissando, 8-bit digital glitch out, defeat arcade sound, synthetic, clean",
        "duration": 1.5
    },
    "powerup_collect.mp3": {
        "text": "arcade game positive chime, bright electronic ascending arpeggio, digital reward, clean synth chime, dry",
        "duration": 1.0
    },
    "match_start.mp3": {
        "text": "futuristic alarm wind up, sudden energetic release, start match fanfare, punchy synth horn, motivational, clean",
        "duration": 2.5
    },
    "round_win.mp3": {
        "text": "short triumphant arcade victory jingle, 8-bit synth brass fanfare, energetic success, clean and punchy, dry",
        "duration": 2.0
    },
    "match_win.mp3": {
        "text": "epic arcade victory fanfare, synth brass arpeggios, majestic celebration tune, retro game win, clean high quality, punchy",
        "duration": 3.0
    },
    "shield_block.mp3": {
        "text": "sci-fi energy shield deflecting laser, force field clang, short, crisp, bright, metallic barrier, clean",
        "duration": 1.0
    },
    "sudden_death.mp3": {
        "text": "urgent sci-fi warning alarm, rhythmic synth pulse, dark tension sting, clean suspense building, isolated, sudden",
        "duration": 2.0
    }
}

out_dir = r"c:\Users\user\Desktop\AutoWebGame\public\assets\audio\sfx"
os.makedirs(out_dir, exist_ok=True)

for filename, config in sfx_prompts.items():
    filepath = os.path.join(out_dir, filename)
    print(f"Generating {filename}...")
    
    data = {
        "text": config["text"],
        "duration_seconds": config["duration"],
        "prompt_influence": 0.65
    }
    
    try:
        response = requests.post(url, json=data, headers=headers)
        if response.status_code == 200:
            with open(filepath, "wb") as f:
                f.write(response.content)
            print(f"Saved {filename} ({config['duration']}s)")
        else:
            print(f"Error for {filename}: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"Request failed: {e}")
    
    time.sleep(1.5)
