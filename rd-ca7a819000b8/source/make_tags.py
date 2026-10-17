"""Build ../tags.txt, the tag list the prompt autocomplete loads, from danbooru.csv.
danbooru.csv is the a1111 tagcomplete list (tag,category,count,"aliases"):
https://raw.githubusercontent.com/DominikDoom/a1111-sd-webui-tagcomplete/main/tags/danbooru.csv
Usage: python3 make_tags.py danbooru.csv   -> writes ../tags.txt (one tag per line: tag TAB category TAB count TAB aliases)
Categories: 0 general, 1 artist, 3 series, 4 character, 5 meta, 9 trainer tags that are typed exactly as written."""
import sys, os, csv
MIN = 200  # posts; keeps the file near 1 MB while still holding most artists and characters people use
# quality, date and rating tags come from the model trainers, not Danbooru, so they are added by hand
EXTRA = ['masterpiece', 'best quality', 'amazing quality', 'good quality', 'normal quality', 'bad quality', 'low quality', 'worst quality',
         'very aesthetic', 'aesthetic', 'displeasing', 'very displeasing', 'newest', 'recent', 'mid', 'early', 'old', 'oldest',
         'general', 'safe', 'sensitive', 'questionable', 'explicit', 'nsfw',
         'score_9', 'score_8_up', 'score_7_up', 'score_6_up', 'score_5_up', 'score_4_up', 'score_6', 'score_5', 'score_4',
         'source_anime', 'source_cartoon', 'source_furry', 'source_pony', 'rating_safe', 'rating_questionable', 'rating_explicit']
rows, seen = [], set()
for i, t in enumerate(EXTRA): rows.append((t, '9', str(10**6 - i), '')); seen.add(t)
with open(sys.argv[1], encoding='utf-8', newline='') as f:
    for r in csv.reader(f):
        if len(r) < 3 or not r[2].isdigit() or int(r[2]) < MIN or r[0] in seen: continue
        al = [a for a in (r[3].split(',') if len(r) > 3 else []) if a and not a.startswith('/')]  # aliases let plain words like "man" or "exercise" find their tag
        rows.append((r[0], r[1], r[2], ','.join(al).replace('\t', ' ')))
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tags.txt')
with open(out, 'w', encoding='utf-8', newline='\n') as f:
    f.write('\n'.join('\t'.join(r) for r in rows) + '\n')
print(len(rows), 'tags ->', os.path.normpath(out), os.path.getsize(out), 'bytes')
