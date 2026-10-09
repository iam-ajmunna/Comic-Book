#!/usr/bin/env python3
"""Reproduce the approved PDF as web assets; never redraw its artwork."""
import argparse,json
from pathlib import Path
import fitz
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('pdf',type=Path);p.add_argument('screenplay',type=Path);a=p.parse_args()
root=Path(__file__).resolve().parents[1];doc=fitz.open(a.pdf);story=json.loads(a.screenplay.read_text())
assert len(doc)==80 and len(story)==40
pages=[]
for n,page in enumerate(doc):
 s=story[(n-1)//2] if n else None;kind='cover' if n==0 else 'comic' if n%2 else 'story'
 pix=page.get_pixmap(matrix=fitz.Matrix(1600/page.rect.width,1600/page.rect.width),alpha=False)
 im=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
 for w,folder,q in [(1600,'pages',86),(800,'pages',83),(180,'thumbs',73)]:
  target=root/'assets'/folder;target.mkdir(parents=True,exist_ok=True)
  resized=im if w==1600 else im.resize((w,round(im.height*w/im.width)),Image.Resampling.LANCZOS)
  resized.save(target/f'{n:03d}{"-small" if w==800 else ""}.webp','WEBP',quality=q,method=5)
 panels=[{'description':x['art'],'dialogue':[{'speaker':d['speaker'].title(),'text':d['text']} for d in x.get('dialogue',[])]} for x in s['panels']] if s and kind=='comic' else []
 pages.append({'id':n,'label':'Cover' if not n else f'{n:02d}','title':s['title'] if s else 'Multiversal Love','kind':kind,'text':page.get_text().strip(),'panels':panels})
 if n%10==0:print(f'Exported {n+1}/80',flush=True)
(root/'assets/book.json').write_text(json.dumps({'title':'Multiversal Love','edition':'revised-80-v1','width':1600,'height':round(1600*738/477),'pages':pages},ensure_ascii=False,separators=(',',':')))
print('80 pages exported',flush=True)
