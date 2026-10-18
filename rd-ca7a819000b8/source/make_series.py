"""Build series.txt: the series (Danbooru copyright tag) of each character tag, so the prompt reader can add it after the
character (frieren -> frieren, sousou no frieren) and can tell link the character from a chain link.
Where it comes from, most sure first:
1. the series in the character's own tag: fern_(sousou_no_frieren), rem_(re:zero), lumine_(genshin_impact)
2. the character lists of Character Select SAA (MIT), which name each character's series in Chinese; a Chinese series name
   is matched to its tag by the characters in step 1 that share it, or by the Chinese tag translations that come with it
3. variants follow their character (hatsune_miku_(append) -> vocaloid), and a one-word name found in exactly one series
   (frieren -> sousou_no_frieren)
4. MANUAL below, for popular characters the lists leave out
Usage: python3 make_series.py danbooru.csv waiIllustriousSDXL_v160_characters.csv danbooru_e621_merged_zh_cn.csv EnglishDictionary.csv
(the middle two: https://github.com/mirabarukaso/character_select_stand_alone_app/tree/main/data, the last: see make_words.py)
Writes series.txt next to this script (character TAB series); make_tags.py adds it to ../tags.txt."""
import sys, os, csv, re, collections
MIN = 200  # same cut as make_tags.py
# short names Danbooru uses inside character tags for some series
QUAL = {'ttgl': 'tengen_toppa_gurren_lagann', 'nikke': 'goddess_of_victory:_nikke', 'honkai_impact': 'honkai_impact_3rd',
        'sao': 'sword_art_online', 'symphogear': 'senki_zesshou_symphogear', 'nanoha': 'mahou_shoujo_lyrical_nanoha',
        'madoka_magica': 'mahou_shoujo_madoka_magica', 'jojo': 'jojo_no_kimyou_na_bouken', 'danganronpa': 'danganronpa_(series)',
        'zelda': 'the_legend_of_zelda', 'dq': 'dragon_quest', 'smt': 'shin_megami_tensei', 'xenoblade': 'xenoblade_chronicles_(series)',
        'mario': 'mario_(series)', 'ff7': 'final_fantasy_vii', 'gundam': 'gundam', 'bang_dream!': 'bang_dream!'}
MANUAL = {
    'vocaloid': 'hatsune_miku hatsune_miku_(append) kagamine_len kagamine_rin megurine_luka sakura_miku',
    'splatoon_(series)': 'inkling_player_character octoling_player_character octoling_girl',
    'k-on!': 'akiyama_mio nakano_azusa hirasawa_yui tainaka_ritsu kotobuki_tsumugi hirasawa_ui',
    'danganronpa_(series)': 'nanami_chiaki oma_kokichi komaeda_nagito saihara_shuichi hinata_hajime kirigiri_kyoko akamatsu_kaede '
                            'enoshima_junko harukawa_maki tsumiki_mikan monokuma naegi_makoto',
    'hololive': "ninomae_ina'nis ninomae_ina'nis_(1st_costume) shiranui_flare mococo_abyssgard mococo_abyssgard_(1st_costume) "
                'nerissa_ravencroft bloop_(gawr_gura) don-chan_(usada_pekora) kureiji_ollie',
    'kill_la_kill': 'matoi_ryuuko senketsu kiryuuin_satsuki mankanshoku_mako junketsu jakuzure_nonon gamagoori_ira',
    'love_live!': 'nishikino_maki tojo_nozomi sonoda_umi yazawa_nico ayase_eli minami_kotori kosaka_honoka hoshizora_rin koizumi_hanayo',
    'love_live!_sunshine!!': 'watanabe_you tsushima_yoshiko sakurauchi_riko takami_chika kurosawa_dia matsuura_kanan '
                             'kunikida_hanamaru kurosawa_ruby ohara_mari',
    'love_live!_nijigasaki_high_school_idol_club': 'uehara_ayumu yuki_setsuna osaka_shizuku nakasu_kasumi tennoji_rina takasaki_yu',
    'link!_like!_love_live!': 'hinoshita_kaho otomune_kozue murano_sayaka osawa_rurino momose_ginko fujishima_megumi anyoji_hime kachimachi_kosuzu',
    'love_live!_superstar!!': 'shibuya_kanon',
    'jojo_no_kimyou_na_bouken': 'kujo_jotaro kakyoin_noriaki kujo_jolyne kishibe_rohan',
    'bocchi_the_rock!': 'kita_ikuyo ijichi_nijika yamada_ryo hiroi_kikuri',
    'touhou': 'miyako_yoshika pyonta',
    'metroid': 'samus_aran',
    'gundam_suisei_no_majo': 'suletta_mercury miorine_rembran',
    'onii-chan_wa_oshimai!': 'oyama_mahiro oyama_mihari',
    'tengen_toppa_gurren_lagann': 'yoko_littner nia_teppelin simon_(ttgl)',
    'honkai_impact_3rd': 'kiana_kaslana fu_hua raiden_mei bronya_zaychik seele_vollerei theresa_apocalypse yae_sakura rita_rossweisse',
    'lycoris_recoil': 'inoue_takina',
    'idolmaster': 'kisaragi_chihaya',
    'idolmaster_cinderella_girls': 'jougasaki_rika akagi_miria sakuma_mayu ohtsuki_yui',
    'idolmaster_shiny_colors': 'mayuzumi_fuyuko hachimiya_meguru asakura_toru kuwayama_chiyuki',
    'sono_bisque_doll_wa_koi_wo_suru': 'kitagawa_marin',
    'boku_no_hero_academia': 'uraraka_ochaco todoroki_shoto',
    'suzumiya_haruhi_no_yuuutsu': 'asahina_mikuru asakura_ryouko',
    'watashi_ga_motenai_no_wa_dou_kangaetemo_omaera_ga_warui!': 'kuroki_tomoko',
    'gridman_universe': 'takarada_rikka shinjou_akane',
    'fate/kaleid_liner_prisma_illya': 'chloe_von_einzbern prisma_illya',
    'monster_hunter_(series)': 'monster_hunter_(character)',
    'nitroplus': 'super_sonico',
    'ore_no_imouto_ga_konna_ni_kawaii_wake_ga_nai': 'gokou_ruri kousaka_kirino',
    'voiceroid': 'kizuna_akari touhoku_kiritan kotonoha_akane kotonoha_aoi zundamon',
    'tiger_&_bunny': 'barnaby_brooks_jr. kaburagi_t._kotetsu',
    'toradora!': 'aisaka_taiga',
    'pokemon': 'rotom lucario morpeko morpeko_(full) mimikyu',
    'yu-gi-oh!': 'dark_magician_girl yuki_judai',
    'gochuumon_wa_usagi_desu_ka?': 'hoto_cocoa',
    'macross_frontier': 'sheryl_nome',
    'needy_girl_overdose': 'chouzetsusaikawa_tenshi-chan',
    'oshi_no_ko': 'arima_kana hoshino_ai hoshino_ruby hoshino_aquamarine',
    'eromanga_sensei': 'izumi_sagiri',
    'code_geass': 'kouzuki_kallen',
    'precure': 'kise_yayoi hoshizora_miyuki houjou_hibiki aida_mana hanasaki_tsubomi sora_harewataru',
    'yuru_yuri': 'toshinou_kyouko akaza_akari funami_yui',
    'kaguya-sama_wa_kokurasetai_~tensai-tachi_no_renai_zunousen~': 'shinomiya_kaguya fujiwara_chika',
    'mahou_shoujo_lyrical_nanoha': 'raising_heart bardiche_(nanoha)',
    'sonic_(series)': 'amy_rose shadow_the_hedgehog',
    'to_heart_2': 'kousaka_tamaki',
    'yurucamp': 'shima_rin',
    'senki_zesshou_symphogear': 'akatsuki_kirika tachibana_hibiki_(symphogear)',
    'project_sekai': 'asahina_mafuyu akiyama_mizuki shinonome_ena yoisaki_kanade tenma_tsukasa',
    'little_busters!': 'noumi_kudryavka natsume_rin',
    'nijisanji': 'shiina_yuika',
    'yuri!!!_on_ice': 'katsuki_yuuri viktor_nikiforov',
    'osomatsu-san': 'matsuno_ichimatsu',
    'the_legend_of_zelda': 'midna',
    're:zero_kara_hajimeru_isekai_seikatsu': 'natsuki_subaru',
    'street_fighter': 'kasugano_sakura',
    'bishoujo_senshi_sailor_moon': 'chibi_usa kino_makoto',
    'goddess_of_victory:_nikke': 'anis_(nikke)',
    'dandadan': 'ayase_momo',
    'xenoblade_chronicles_2': 'rex_(xenoblade)',
    'frozen_(disney)': 'elsa_(frozen)',
    'air_(visual_novel)': 'kamio_misuzu',
    'shantae_(series)': 'shantae',
    'dragon_ball': 'android_21',
    'clannad': 'furukawa_nagisa fujibayashi_kyou',
    'neon_genesis_evangelion': 'katsuragi_misato',
    'marvel': 'deadpool',
    'gegege_no_kitarou': 'nekomusume',
}

def tag_rows(path):
    rows = []
    with open(path, encoding='utf-8', newline='') as f:
        for r in csv.reader(f):
            if len(r) >= 3 and r[2].isdigit() and int(r[2]) >= MIN: rows.append((r[0], r[1], int(r[2]), r[3].split(',') if len(r) > 3 and r[3] else []))
    return rows

def build(rows, wai_csv, zh_csv, english):
    C = {t: n for t, c, n, al in rows if c == '3'}
    calias = {}
    for t, c, n, al in rows:
        if c == '3':
            for a in al: calias.setdefault(a, t)
    def resolve(q):
        for k in (q, QUAL.get(q), calias.get(q), q + '_(series)'):
            if k and k in C: return k
    def split(tag):  # "abigail_williams_(swimsuit)_(fate)" -> "abigail_williams", ["swimsuit", "fate"]
        return re.sub(r'(_\([^()]*\))+$', '', tag), re.findall(r'_\(([^()]*)\)', tag)
    chars = [t for t, c, n, al in rows if c == '4']
    out = {}
    for t in chars:
        for q in reversed(split(t)[1]):
            s = resolve(q)
            if s: out[t] = s; break
    zh, franchise = collections.defaultdict(set), {}  # Chinese name -> copyright tags; name -> the tag translated "name (series)"
    for z in csv.reader(open(zh_csv, encoding='utf-8-sig')):
        if len(z) >= 3 and z[1] == '3' and z[0] in C:
            name = z[2].strip()
            base = re.sub(r'[（(]系列[）)]$|系列$', '', name).strip()
            zh[name].add(z[0])
            if base != name: zh[base].add(z[0]); franchise[base] = z[0]
    wai, votes = {}, collections.defaultdict(collections.Counter)
    for row in csv.reader(open(wai_csv, encoding='utf-8-sig')):
        if len(row) < 2: continue
        m = re.findall(r'[（(]([^（）()]+)[）)]', row[0])
        if not m: continue
        t, cn = row[1].strip().replace(' ', '_'), m[-1].strip()
        wai[t] = cn
        if t in out: votes[cn][out[t]] += 1
    cnmap = {}
    for cn in set(wai.values()):
        v = votes.get(cn)
        if v:
            s, k = v.most_common(1)[0]
            if k >= 0.8 * sum(v.values()): cnmap[cn] = s
            continue  # characters that name the series outvote the translations, which mix up some games
        for key in (cn, cn.replace('Project', '').strip(), cn.replace('系列', '').strip()):
            # a name shared by two games (黑暗之魂 is both Dark Souls and Black Souls) goes to the one translated as the series
            if len(zh.get(key, ())) == 1: cnmap[cn] = next(iter(zh[key])); break
            if key in franchise: cnmap[cn] = franchise[key]; break
    for t in chars:
        if t not in out:
            cn = wai.get(t) or wai.get(split(t)[0])
            if cn in cnmap: out[t] = cnmap[cn]
    for s, names in MANUAL.items():
        if s in C:
            for t in names.split():
                if t in set(chars): out[t] = s
    for t in chars:  # variants: hatsune_miku_(append) -> vocaloid
        base = split(t)[0]
        if t not in out and base != t and base in out: out[t] = out[base]
    used, words = set(out.values()), collections.defaultdict(set)
    for s in used:
        for w in re.split(r'[^a-z0-9]+', s):
            if len(w) >= 4 and w not in english: words[w].add(s)
    for t in chars:  # a one-word name found in exactly one series: frieren -> sousou_no_frieren
        base = split(t)[0]
        if t not in out and '_' not in base and len(words.get(base, ())) == 1: out[t] = next(iter(words[base]))
    return out

if __name__ == '__main__':
    rows = tag_rows(sys.argv[1])
    english = set()
    for r in csv.reader(open(sys.argv[4], encoding='utf-8')):
        if len(r) >= 3 and r[2].isdigit(): english.add(r[0])
    out = build(rows, sys.argv[2], sys.argv[3], english)
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'series.txt')
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(''.join(f'{t}\t{s}\n' for t, s in sorted(out.items())))
    print(len(out), 'of', sum(1 for r in rows if r[1] == '4'), 'characters ->', path)
