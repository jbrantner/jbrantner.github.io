"""Build ../chars.txt: for every character tag in ../tags.txt, how often Danbooru posts of that character are tagged
1girl, 1boy or 1other. The app uses it to count who is in a prompt (zelda -> a girl, zelda and link -> 1boy, 1girl).
Usage: python3 make_chars.py   (asks Danbooru's related-tags API once per character, politely; safe to stop and rerun)
Output lines: tag TAB girl TAB boy TAB other, each a share from 0 to 1."""
import asyncio, json, os, aiohttp
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'chars.txt')
PARTS = os.path.join(HERE, 'chars_progress.json')  # resume file, not published
chars = [l.split('\t')[0] for l in open(os.path.join(HERE, '..', 'tags.txt'), encoding='utf-8') if l.split('\t')[1:2] == ['4']]
done = json.load(open(PARTS, encoding='utf-8')) if os.path.exists(PARTS) else {}
todo = [c for c in chars if c not in done]
print(len(chars), 'characters,', len(todo), 'to fetch')

async def one(s, tag):
    for attempt in range(4):
        try:
            async with s.get('https://danbooru.donmai.us/related_tag.json', params={'query': tag, 'category': 'general', 'limit': '50'}) as r:
                if r.status == 429:
                    await asyncio.sleep(5 * (attempt + 1)); continue
                j = await r.json()
                f = {t['tag']['name']: t['frequency'] for t in j.get('related_tags', [])}
                return [round(f.get(k, 0), 2) for k in ('1girl', '1boy', '1other')]
        except Exception:
            await asyncio.sleep(3)
    return None

async def main():
    q = asyncio.Queue(); [q.put_nowait(t) for t in todo]
    async with aiohttp.ClientSession(headers={'User-Agent': 'RenderDeck/1.0 (personal prompt helper)'}, timeout=aiohttp.ClientTimeout(total=30)) as s:
        async def worker():
            while not q.empty():
                tag = q.get_nowait(); v = await one(s, tag)
                if v is not None: done[tag] = v
                if len(done) % 200 == 0:
                    json.dump(done, open(PARTS, 'w', encoding='utf-8')); print(len(done), 'done', flush=True)
                await asyncio.sleep(0.3)
        await asyncio.gather(*[worker() for _ in range(3)])
    json.dump(done, open(PARTS, 'w', encoding='utf-8'))
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        for c in chars:
            if c in done: f.write('\t'.join([c] + [str(x) for x in done[c]]) + '\n')
    print('wrote', OUT, sum(1 for c in chars if c in done), 'characters')

asyncio.run(main())
