# Genera index.html (immagini in img/) e pagina.html (immagini incorporate) da sorgente.html
import base64,os
here=os.path.dirname(os.path.abspath(__file__))
src=open(os.path.join(here,'sorgente.html'),encoding='utf-8').read()
def uri(p,mime): return 'data:%s;base64,%s'%(mime,base64.b64encode(open(os.path.join(here,p),'rb').read()).decode())
pag=src.replace('{{HERO}}',uri('img/hero.jpg','image/jpeg')).replace('{{LOGO}}',uri('img/logo.png','image/png')).replace('{{FAVICON}}',uri('img/favicon.png','image/png'))
open(os.path.join(here,'pagina.html'),'w',encoding='utf-8').write(pag)
idx=src.replace('{{HERO}}','img/hero.jpg').replace('{{LOGO}}','img/logo.png').replace('{{FAVICON}}','img/favicon.png')
head,rest=idx.split('<header class="nav"',1)
full='<!doctype html>\n<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n'+head+'</head><body>\n<header class="nav"'+rest+'\n</body></html>\n'
open(os.path.join(here,'index.html'),'w',encoding='utf-8').write(full)
print('ok')
