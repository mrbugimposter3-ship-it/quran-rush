import json, os
U=json.load(open('quran-uthmani.json'))['data']['surahs']
T=json.load(open('en.transliteration.json'))['data']['surahs']
E=json.load(open('en.sahih.json'))['data']['surahs']
_b=U[0]['ayahs'][0]['text'].replace('\ufeff','').split(' ')
assert len(_b)==4
B1=' '.join(_b)+' '
B2=_b[0][0]+'\u0651'+_b[0][1:]+' '+' '.join(_b[1:])+' '   # variant with shadda on ba (e.g. 95:1, 97:1)
print([hex(ord(c)) for c in _b[0]])
out='/workspace/quran-rush/data/s'; os.makedirs(out,exist_ok=True)
meta=[]; juz=[None]*31; hq=[None]*241; stripped=[]; g=0; size=0
for su,st,se in zip(U,T,E):
    sid=su['number']; rows=[]
    assert len(su['ayahs'])==len(st['ayahs'])==len(se['ayahs'])
    for i,(a,t,e) in enumerate(zip(su['ayahs'],st['ayahs'],se['ayahs'])):
        g+=1; assert a['number']==g==t['number']==e['number'] and a['numberInSurah']==i+1
        ar=a['text'].replace('\ufeff','').strip(); tr=t['text'].replace('\ufeff','').strip(); en=e['text'].replace('\ufeff','').strip()
        if i==0 and sid not in (1,9):
            if ar.startswith(B1): ar=ar[len(B1):]; stripped.append((sid,'B1'))
            elif ar.startswith(B2): ar=ar[len(B2):]; stripped.append((sid,'B2'))
            else: raise SystemExit('no basmala in %d: %r'%(sid,ar[:40]))
            assert ar and not ar.startswith(B1[:4]) and not ar.startswith(B2[:4]) and B1.strip() not in ar, sid
        if sid==9 and i==0: assert not ar.startswith(B1[:4]) and not ar.startswith(B2[:4])
        if sid==1 and i==0: assert ar+' '==B1, repr(ar)
        assert '\ufeff' not in ar+tr+en and ar and tr and en
        rows.append([ar,tr,en])
        if juz[a['juz']] is None: juz[a['juz']]=[sid,i+1]
        if hq[a['hizbQuarter']] is None: hq[a['hizbQuarter']]=[sid,i+1]
    s=json.dumps(rows,ensure_ascii=False,separators=(',',':'))
    open('%s/%03d.json'%(out,sid),'w').write(s); size+=len(s.encode())
    meta.append({'id':sid,'name':su['englishName'],'meaning':su['englishNameTranslation'],'arName':su['name'],'count':len(rows),'type':su['revelationType'][0]})
assert g==6236 and None not in juz[1:] and None not in hq[1:]
assert len(stripped)==112, len(stripped)
print('stripped',len(stripped),'variant B2:',[s for s,v in stripped if v=='B2'])
hdr=('// Quran Rush metadata. Text per surah in data/s/NNN.json as [arabic, transliteration, english] rows.\n'
     '// Arabic: Uthmani (Tanzil via api.alquran.cloud quran-uthmani; Basmala prefix removed from ayah 1 except Al-Fatiha, At-Tawbah has none).\n'
     '// Transliteration: en.transliteration; English: Saheeh International (en.sahih).\n')
open('/workspace/quran-rush/data/meta.js','w').write(hdr+'window.QMETA='+json.dumps({'surahs':meta,'juz':juz[1:],'hq':hq[1:]},ensure_ascii=False,separators=(',',':'))+';\n')
print('total bytes',size)
