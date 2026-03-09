#!/usr/bin/env python3
"""
fetch-style-data.py
Fetches recent tweets from primary style reference accounts via xAI x_search.
Outputs JSON to stdout.
"""
import json, sys
from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import x_search

secrets = open('/root/.openclaw/workspace/.env.secrets').read()
api_key = next(l.split('=',1)[1].strip() for l in secrets.splitlines() if l.startswith('XAI_API_KEY='))
client = Client(api_key=api_key)

PRIMARY_ACCOUNTS = ['bramk', 'BitPaine', 'JeffBooth', 'LynAldenContact', 'jackmallers', 'LawrenceLepard']

all_data = []

for handle in PRIMARY_ACCOUNTS:
    print(f"  Fetching @{handle}...", file=sys.stderr)
    try:
        chat = client.chat.create(model="grok-4-1-fast-non-reasoning", tools=[x_search()])
        chat.append(user(
            f"Search X for the 30 most recent tweets from @{handle} about Bitcoin, money, inflation, AI, or macro economics. "
            f"Return ONLY a valid JSON array. Each object must have: text (string), likes (integer). No other output."
        ))
        response = chat.sample()
        content = response.content or ''
        start = content.find('[')
        end = content.rfind(']') + 1
        if start >= 0 and end > start:
            tweets = json.loads(content[start:end])
            print(f"    Got {len(tweets)} tweets", file=sys.stderr)
            all_data.append({"handle": handle, "tweets": tweets})
        else:
            print(f"    No JSON found for @{handle}: {content[:100]}", file=sys.stderr)
            all_data.append({"handle": handle, "tweets": []})
    except Exception as e:
        print(f"    Error for @{handle}: {e}", file=sys.stderr)
        all_data.append({"handle": handle, "tweets": []})

print(json.dumps(all_data))
