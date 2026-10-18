"""Build ../words.txt, the English words the prompt reader knows are real words, so it never "fixes" one into a tag
(vibrant is not a typo of vibrator), can tell casting is cast + ing, and knows Link and Fern are also everyday words
(so it only reads them as characters when their series is in the prompt too).
Three parts, split by lines holding just #:
1. everyday words, most used first: in Webster's 2nd (the web2 list) and among the 40,000 most used English words (wordfreq)
2. the other words of EnglishDictionary.csv from the a1111 tagcomplete extension (word,0,count,"misspellings"):
   https://raw.githubusercontent.com/DominikDoom/a1111-sd-webui-tagcomplete/main/tags/EnglishDictionary.csv
   It leaves out words that are Danbooru tags or aliases (red, glasses), which part 1 brings back.
3. names among the 10,000 most used words (tokyo, paris, john), so one word of a long series name (tokyo afterschool
   summoners) isn't taken for the series
Usage: python3 -m pip install wordfreq english-words
       python3 make_words.py EnglishDictionary.csv   -> writes ../words.txt"""
import sys, os, csv, re
import wordfreq
from english_words import get_english_words_set
word = re.compile(r'[a-z]{2,}')
web2 = {w for w in get_english_words_set(['web2'], lower=False, alpha=True) if w.islower()}  # lower case: no names like Alice
everyday = [w for w in wordfreq.top_n_list('en', 40000) if word.fullmatch(w) and w in web2]
other = set()
with open(sys.argv[1], encoding='utf-8', newline='') as f:
    for r in csv.reader(f):
        # words with a count are the ones people use (about 46,000); the uncounted tail is mostly archaic
        if len(r) >= 3 and r[2].isdigit() and word.fullmatch(r[0]): other.add(r[0])
other -= set(everyday)
names = [w for w in wordfreq.top_n_list('en', 10000) if word.fullmatch(w) and w not in web2 and w not in other]
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'words.txt')
with open(out, 'w', encoding='utf-8', newline='\n') as f:
    f.write('\n'.join(everyday) + '\n#\n' + '\n'.join(sorted(other)) + '\n#\n' + '\n'.join(names) + '\n')
print(len(everyday), 'everyday +', len(other), 'other words +', len(names), 'names ->', os.path.normpath(out), os.path.getsize(out), 'bytes')
