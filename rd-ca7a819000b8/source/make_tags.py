"""Build ../tags.txt, the tag list the prompt autocomplete loads, from danbooru.csv.
danbooru.csv is the a1111 tagcomplete list (tag,category,count,"aliases"):
https://raw.githubusercontent.com/DominikDoom/a1111-sd-webui-tagcomplete/main/tags/danbooru.csv
Usage: python3 make_tags.py danbooru.csv   -> writes ../tags.txt
One tag per line: tag TAB category TAB count TAB aliases, then two columns only where they hold something:
flags (how adult the tag is: s suggestive, q nudity, e sexual, g gore; the prompt reader only uses these when adult
words are typed, and picks the rating tag from them) TAB series (a character's
copyright tag, from series.txt, made by make_series.py).
Categories: 0 general, 1 artist, 3 series, 4 character, 5 meta, 9 trainer tags that are typed exactly as written."""
import sys, os, csv, re
MIN = 200  # posts; keeps the file near 1 MB while still holding most artists and characters people use
# quality, date and rating tags come from the model trainers, not Danbooru, so they are added by hand
EXTRA = ['masterpiece', 'best quality', 'amazing quality', 'good quality', 'normal quality', 'bad quality', 'low quality', 'worst quality',
         'very aesthetic', 'aesthetic', 'displeasing', 'very displeasing', 'newest', 'recent', 'mid', 'early', 'old', 'oldest',
         'general', 'safe', 'sensitive', 'questionable', 'explicit', 'nsfw',
         'score_9', 'score_8_up', 'score_7_up', 'score_6_up', 'score_5_up', 'score_4_up', 'score_6', 'score_5', 'score_4',
         'source_anime', 'source_cartoon', 'source_furry', 'source_pony', 'rating_safe', 'rating_questionable', 'rating_explicit']
# a tag holding one of these words is sexual (or gore), unless it is in SAFE
WORDS = set('''penis penises pussy pussies vagina vaginal vulva labia clitoris clitoral anus anal anilingus cum cumdrip cumshot semen sperm
ejaculation ejaculating erection orgasm orgasms sex sexual sexually masturbation masturbating fellatio autofellatio cunnilingus handjob footjob
paizuri naizuri titjob titfuck blowjob rimjob rimming irrumatio fingering fisting penetration penetrated penetrating dildo dildos vibrator
vibrators condom condoms lube hitachi tenga onahole bukkake gangbang orgy threesome foursome rape raped molestation molested groping
nipples nipple areola areolae areolas nude naked bottomless topless pubic testicles testicle scrotum crotch crotchless cameltoe lactation lactating
futanari futa incest loli lolicon shota shotacon bestiality zoophilia ahegao torogao netorare ntr ryona guro vore scat peeing pee urination urine
piss pissing watersports enema diaper bondage bdsm shibari femdom dominatrix domination sadism masochism humiliation hentai lewd humping frottage
tribadism hickey exhibitionism voyeurism upskirt downblouse pantyshot panchira panties underwear lingerie thong g-string bra bras pasties maebari
breastfeeding cleavage underboob sideboob gokkun creampie prostate uterus cervix womb hymen defloration strap-on strapon buttplug chastity spreader
gag gagged smegma glans foreskin precum frenulum perineum sextoy fucked buttjob thighjob hairjob tailjob shoejob tentaclejob tonguejob pecjob glansjob
deepthroat spitroast panty ovum ovaries necrophilia pegging speculum knotting spanking spanked aroused autoarousal moaning foreplay oral underbutt nudity
breast breasts ass butt buttocks bulge bulges groin briefs boxers jockstrap fundoshi stripper severed corpse corpses amputee suicide torture
cannibalism intestines decapitation disembowelment dismemberment hanged'''.split())
# runs of tag words anywhere in the tag
SEQS = '''sex_toy breast_out breasts_out one_breast_out nipple_slip wardrobe_malfunction covering_crotch spread_legs spread_ass spread_pussy
spread_anus spread_navel spread_armpit presenting bent_over_furniture panty_pull pantyhose_pull shorts_pull skirt_lift dress_lift shirt_lift
bra_lift clothes_lift lifted_by_self undressing no_panties no_bra partially_undressed convenient_censoring mosaic_censoring bar_censor
heart_censor steam_censor transparent_censoring tentacle_sex tentacle_pit tentacles_on_male tentacle_in_mouth tentacle_grab penis_tentacle
tentacle_clothes consensual_tentacles tentacles_under_clothes kissing_penis straddling girl_on_top boy_on_top from_behind_position cowgirl_position
doggystyle missionary mating_press standing_sex full_nelson leg_lock prone_bone pussy_juice love_juice steaming_body micro_bikini
slingshot_swimsuit string_bikini reverse_bunnysuit reverse_outfit revealing_clothes skindentation thigh_gap armpit_sex object_insertion
foreign_object stomach_bulge throat_bulge impregnation internal_cumshot legs_over_head top-down_bottom-up pet_play human_dog human_toilet
slave public_use public_indecency x-ray_vision happy_facial teamwork_(sexual) suggestive_fluid prostitution heavy_breathing shared_bathing
mixed-sex_bathing same-sex_bathing crotch_rope ball_gag bit_gag tape_gag ring_gag cleave_gag cloth_gag gag_harness butt_plug butt_crack
see-through clothes_pull clothing_aside skirt_pull shirt_pull pants_pull bikini_pull bikini_bottom_pull bikini_top_pull bikini_top_lift
bikini_top_aside bikini_bottom_aside swimsuit_aside swimsuit_lift one-piece_swimsuit_pull leotard_aside leotard_pull leotard_peek kimono_pull
kimono_lift dress_pull dress_aside top_pull tube_top_lift camisole_lift camisole_pull bodysuit_pull buruma_pull buruma_aside bloomers_pull
pelvic_curtain_lift pelvic_curtain_aside sarong_lift hakama_lift apron_lift sweater_lift sweater_vest_lift cardigan_lift vest_lift hoodie_lift
shorts_aside thighhighs_pull pajamas_pull wind_lift between_thighs another's_thigh another's_thighs licking_armpit licking_foot licking_stomach
toe_sucking egg_laying mounting held_down bed_invitation smash_invitation saliva_swap virgin_killer_sweater virgin_destroyer_sweater
backwards_virgin_killer_sweater virgin_killer_outfit open-chest_sweater tanline_peek side-tie_peek assisted_exposure wet_spot on_toilet toilet_use
milking_machine hand_milking golden_shower change_in_common_sense exposed_brain gimp_mask gimp_suit in_heat grinding gaping flashing 69 sitting_on_face'''.split()
# tags that are sexual only as the whole tag
EXACT = set('facial folded tally censored'.split())
# ordinary tags that hold one of the words above
SAFE = set('''breasts large_breasts medium_breasts small_breasts flat_chest breast_pocket breastplate double-breasted ass huge_ass flat_ass
cheek_bulge toe_cleavage strap_between_breasts tied_up_(nonsexual) sports_bra bra_strap gag_reflex x-ray cross-section kneepits body_writing
covered_mouth see-through_sleeves see-through_jacket see-through_cape see-through_shawl see-through_veil see-through_umbrella
see-through_curtains see-through_gloves severed_hair butt cigarette_butt'''.split())
# sexual tags whose words also mean everyday things (a bottomless pit, a running gag, a girl presenting a gift, a girl on top of
# a hill, boxers in a ring, a strap on her bag, the g string of a violin, a folded map) get a w after their level: the reader
# takes them from a sentence only when the prompt is plainly adult already. MILD: words of WORDS with an innocent sense;
# MILDSEQ: runs of SEQS made of innocent words; EXACT tags are all w.
MILD = set('''bottomless bulge bulges gag g-string strap-on strapon oral pasties boxers briefs diaper womb domination knotting
spanking humiliation'''.split())
MILDSEQ = set('''presenting straddling girl_on_top boy_on_top missionary slave heavy_breathing steaming_body held_down full_nelson
leg_lock mounting egg_laying on_toilet between_thighs wet_spot shared_bathing mixed-sex_bathing same-sex_bathing wind_lift
public_indecency pet_play human_dog prostitution foreign_object in_heat grinding gaping flashing 69 sitting_on_face'''.split())
GORE_TAGS = set('holding_detached_head'.split())  # "holding her head" is not this
# other names Danbooru lacks that people type
MORE_ALIASES = {'honkai:_star_rail': ['star_rail', 'hsr'], 'sword_art_online': ['sao'], 'jujutsu_kaisen': ['jjk'], 'chainsaw_man': ['csm'],  # short names people type for a series
                'cum_in_pussy': ['creampie'], 'sex': ['intercourse', 'sexual_intercourse'], 'breasts_out': ['bare_breasts', 'exposed_breasts'],  # and everyday names of adult tags
                'partially_undressed': ['partially_nude', 'partially_naked', 'semi-nude', 'seminude', 'half_naked', 'half-naked', 'half_nude', 'half_undressed']}
# how adult a flagged tag is, for the rating tag: suggestive (s), nudity (q), sexual (e, everything else flagged) or gore (g)
GORE = set('ryona guro vore severed corpse corpses amputee suicide torture cannibalism intestines decapitation disembowelment dismemberment hanged necrophilia'.split())
NUDE = set('nipples nipple areola areolae areolas nude naked nudity bottomless topless pubic'.split())
NUDE_SEQS = set('''breast_out breasts_out one_breast_out nipple_slip wardrobe_malfunction convenient_censoring mosaic_censoring bar_censor heart_censor
steam_censor transparent_censoring no_panties no_bra partially_undressed undressing assisted_exposure tanline_peek censored breast_slip
clothes_pull clothing_aside panty_pull bikini_pull bikini_bottom_pull bikini_top_pull bikini_top_lift bikini_top_aside bikini_bottom_aside
swimsuit_aside swimsuit_lift one-piece_swimsuit_pull leotard_aside leotard_pull bra_lift shirt_pull dress_pull top_pull'''.split())
TOUCH = set('stimulation tweak tweaking sucking licking pinch pinching rubbing grab grabbing groping play'.split())  # being touched there is sexual
SUGG = set('''panties panty underwear lingerie thong g-string bra bras pasties cleavage underboob sideboob downblouse upskirt pantyshot panchira
breast breasts ass butt buttocks underbutt bulge bulges groin crotch cameltoe briefs boxers jockstrap fundoshi hickey lewd'''.split())
SUGG_SEQS = set('''see-through micro_bikini slingshot_swimsuit string_bikini revealing_clothes skindentation thigh_gap skirt_lift dress_lift
shirt_lift clothes_lift lifted_by_self wind_lift covering_crotch steaming_body heavy_breathing bed_invitation virgin_killer_sweater
virgin_destroyer_sweater backwards_virgin_killer_sweater open-chest_sweater side-tie_peek leotard_peek between_thighs another's_thigh
another's_thighs shared_bathing mixed-sex_bathing same-sex_bathing butt_crack wet_spot'''.split())
RANK = {'': 0, 's': 1, 'q': 2, 'e': 3, 'g': 4}
# tags the words above rank too high: a shirtless man is only suggestive (Danbooru rates male toplessness general or sensitive)
LEVEL = {'topless_male': 's', 'boxer_briefs': 's'}  # (and boxer briefs are plainly underwear, though boxers and briefs alone may be boxing or papers)
def nsfw(tag):
    """'' for an ordinary tag, else how adult it is (s, q, e or g), plus w when its words have an everyday meaning too"""
    t = tag.lower()
    if t in SAFE: return ''
    if t in LEVEL: return LEVEL[t]
    if t in GORE_TAGS: return 'g'
    lv, hard, soft = '', False, False
    def up(x):
        nonlocal lv
        if RANK[x] > RANK[lv]: lv = x
    if t in EXACT: up('q' if t == 'censored' else 'e')
    for w in re.split(r'[_()]+', t):
        if w.endswith("'s"): w = w[:-2]
        if w in WORDS: up('g' if w in GORE else 'q' if w in NUDE else 's' if w in SUGG else 'e'); hard, soft = hard or w not in MILD, True
    for q in SEQS:
        if re.search(r'(^|_)' + re.escape(q) + r'($|_)', t): up('q' if q in NUDE_SEQS else 's' if q in SUGG_SEQS else 'e'); hard, soft = hard or q not in MILDSEQ, True
    if lv in ('s', 'q') and any(w in TOUCH for w in re.split(r'[_()]+', t)): lv = 'e'
    return lv + ('w' if lv and (t in EXACT or (soft and not hard)) else '')

here = os.path.dirname(os.path.abspath(__file__))
series = {}
if os.path.exists(os.path.join(here, 'series.txt')):
    for l in open(os.path.join(here, 'series.txt'), encoding='utf-8'):
        t, _, s = l.rstrip('\n').partition('\t')
        if s: series[t] = s
rows, seen = [], set()
for i, t in enumerate(EXTRA): rows.append([t, '9', str(10**6 - i), '']); seen.add(t)
with open(sys.argv[1], encoding='utf-8', newline='') as f: csvrows = list(csv.reader(f))
titles = {r[0] for r in csvrows if len(r) > 2 and r[1] == '3'}  # a character named like its series (violet_evergarden, violet_evergarden_(series)) is from that series
for r in csvrows:
        if len(r) < 3 or not r[2].isdigit() or int(r[2]) < MIN or r[0] in seen: continue
        al = [a for a in (r[3].split(',') if len(r) > 3 else []) if a and not a.startswith('/')] + MORE_ALIASES.get(r[0], [])  # aliases let plain words like "man" or "exercise" find their tag
        row = [r[0], r[1], r[2], ','.join(al).replace('\t', ' ')]
        own = re.sub(r'_\(character\)$', '', r[0]) + '_(series)'  # (black_jack_(character) too; lisa_(ponyo) is no lisa_(series))
        flag, ser = nsfw(r[0]) if r[1] in ('0', '5') else '', (series.get(r[0], '') or (own if own in titles else '')) if r[1] == '4' else ''
        if flag or ser: row.append(flag)
        if ser: row.append(ser)
        rows.append(row)
out = os.path.join(here, '..', 'tags.txt')
with open(out, 'w', encoding='utf-8', newline='\n') as f:
    f.write('\n'.join('\t'.join(r) for r in rows) + '\n')
print(len(rows), 'tags ->', os.path.normpath(out), os.path.getsize(out), 'bytes;',
      ', '.join(f'{sum(len(r) > 4 and r[4][:1] == k for r in rows)} {k}' for k in 'sqeg'), 'flagged,', sum(len(r) > 4 and r[4].endswith('w') for r in rows), 'only in adult prompts,', sum(len(r) > 5 for r in rows), 'with a series')
