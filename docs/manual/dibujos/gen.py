"""Genera los esquemas de racks del manual (SVG). Uso: python3 gen.py"""
AZUL="#1d4ed8"; NAR="#ea580c"

def selectivo():
    mods, cols, niv = 3, 2, 3
    izq, arriba = 92, 14
    cw, ch, gapm, up = 62, 46, 14, 6
    ocup = {("01",1),("02",1),("04",1),("05",1),("02",2),("01",2),("03",2)}
    marca = ("06",3)
    W = izq + mods*(cols*cw + 2*up) + (mods-1)*gapm + 10
    H = arriba + niv*ch + 70
    o=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="100%" font-family="Inter, sans-serif">']
    piso = arriba + niv*ch
    o.append(f'<line x1="{izq-6}" y1="{piso}" x2="{W-4}" y2="{piso}" stroke="#94a3b8" stroke-width="2"/>')
    for n in range(1,niv+1):
        y = piso - (n-0.5)*ch
        nombre = {1:"piso",2:"medio",3:"arriba"}[n]
        o.append(f'<text x="{izq-10}" y="{y+3}" font-size="9" fill="#64748b" text-anchor="end">nivel {n} · {nombre}</text>')
    col = 0
    for m in range(mods):
        x0 = izq + m*(cols*cw + 2*up + gapm); x1 = x0 + 2*up + cols*cw
        o.append(f'<rect x="{x0}" y="{arriba-4}" width="{x1-x0}" height="{piso-arriba+4}" fill="#f8fafc"/>')
        for xp in (x0, x1-up):
            o.append(f'<rect x="{xp}" y="{arriba-6}" width="{up}" height="{piso-arriba+6}" fill="{AZUL}" rx="1"/>')
            for k in range(int((piso-arriba)/10)):
                o.append(f'<circle cx="{xp+up/2}" cy="{arriba+4+k*10}" r="0.9" fill="#bfdbfe"/>')
            o.append(f'<rect x="{xp-3}" y="{piso-3}" width="{up+6}" height="3" fill="#1e3a8a"/>')
        for n in range(1, niv):
            o.append(f'<rect x="{x0+up}" y="{piso - n*ch - 3}" width="{x1-x0-2*up}" height="5" fill="{NAR}" rx="1"/>')
        o.append(f'<rect x="{x0+up}" y="{arriba-3}" width="{x1-x0-2*up}" height="5" fill="{NAR}" rx="1"/>')
        for c in range(cols):
            col += 1; cod = f"{col:02d}"; cx = x0 + up + c*cw
            for n in range(1,niv+1):
                y = piso - n*ch + 6
                es = (cod,n)==marca
                if (cod,n) in ocup or es:
                    fill = "#fef9c3" if es else "#dbeafe"; st = "#ca8a04" if es else "#60a5fa"
                    o.append(f'<rect x="{cx+5}" y="{y+4}" width="{cw-10}" height="{ch-17}" rx="2" fill="{fill}" stroke="{st}" stroke-width="1.3"/>')
                    o.append(f'<rect x="{cx+3}" y="{y+ch-14}" width="{cw-6}" height="4" fill="#b45309"/>')
                    o.append(f'<text x="{cx+cw/2}" y="{y+ch/2-1}" font-size="8.5" font-weight="700" fill="#0f172a" text-anchor="middle" font-family="JetBrains Mono, monospace">D-{cod}-{n}</text>')
                else:
                    o.append(f'<text x="{cx+cw/2}" y="{y+ch/2-1}" font-size="8" fill="#94a3b8" text-anchor="middle" font-family="JetBrains Mono, monospace">D-{cod}-{n}</text>')
            o.append(f'<text x="{cx+cw/2}" y="{piso+13}" font-size="9" font-weight="700" fill="#334155" text-anchor="middle">col. {cod}</text>')
        yb = piso + 22
        o.append(f'<path d="M{x0+2} {yb} L{x0+2} {yb+5} L{x1-2} {yb+5} L{x1-2} {yb}" fill="none" stroke="#94a3b8" stroke-width="1"/>')
        o.append(f'<text x="{(x0+x1)/2}" y="{yb+17}" font-size="9" fill="#64748b" text-anchor="middle" font-style="italic">módulo {m+1}</text>')
    o.append('</svg>')
    return "\n".join(o)

def penetrable():
    clark=open(__import__('os').path.join(__import__('os').path.dirname(__file__), 'clark.svg')).read()
    cuerpo=clark[clark.index('>')+1:clark.rindex('</svg>')]
    Wp, Hp = 640, 226
    piso=196; izq=330; prof=2; niv=3; cw=110; ch=50
    o=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {Wp} {Hp}" width="100%" font-family="Inter, sans-serif">']
    o.append(f'<line x1="0" y1="{piso}" x2="{Wp}" y2="{piso}" stroke="#94a3b8" stroke-width="2"/>')
    xp = izq + prof*cw + 14
    o.append(f'<rect x="{xp}" y="{piso-niv*ch-14}" width="14" height="{niv*ch+14}" fill="#cbd5e1"/>')
    o.append(f'<text x="{xp+7}" y="{piso+14}" font-size="9" fill="#64748b" text-anchor="middle">pared</text>')
    for xx in (izq, izq+prof*cw+6):
        o.append(f'<rect x="{xx}" y="{piso-niv*ch-8}" width="6" height="{niv*ch+8}" fill="{AZUL}"/>')
    for n in range(2,niv+1):
        o.append(f'<rect x="{izq+6}" y="{piso-(n-1)*ch-3}" width="{prof*cw}" height="5" fill="{NAR}" opacity="0.85"/>')
    llenas={(1,1),(1,2),(2,2),(2,1)}
    for n in range(1,niv+1):
        o.append(f'<text x="{izq-8}" y="{piso-(n-0.5)*ch+3}" font-size="9" fill="#64748b" text-anchor="end">{ {1:"piso",2:"medio",3:"arriba"}[n] }</text>')
        for d in range(1,prof+1):
            x = izq+6+(d-1)*cw; y = piso-n*ch+6; cod=f"B-07-{n}-{d}"
            if (n,d) in llenas:
                es=(n,d)==(2,1)
                o.append(f'<rect x="{x+6}" y="{y+3}" width="{cw-12}" height="{ch-17}" rx="2" fill="{"#fef9c3" if es else "#dbeafe"}" stroke="{"#ca8a04" if es else "#60a5fa"}" stroke-width="1.3"/>')
                o.append(f'<rect x="{x+4}" y="{y+ch-14}" width="{cw-8}" height="4" fill="#b45309"/>')
                o.append(f'<text x="{x+cw/2}" y="{y+ch/2-1}" font-size="9" font-weight="700" fill="#0f172a" text-anchor="middle" font-family="JetBrains Mono, monospace">{cod}</text>')
            else:
                o.append(f'<rect x="{x+6}" y="{y+3}" width="{cw-12}" height="{ch-17}" rx="2" fill="white" stroke="#cbd5e1" stroke-dasharray="3 2"/>')
                o.append(f'<text x="{x+cw/2}" y="{y+ch/2-1}" font-size="8.5" fill="#94a3b8" text-anchor="middle" font-family="JetBrains Mono, monospace">{cod}</text>')
    for d,t in ((1,"1 · pasillo"),(2,"2 · fondo")):
        o.append(f'<text x="{izq+6+(d-0.5)*cw}" y="{piso+14}" font-size="9" font-weight="700" fill="#334155" text-anchor="middle">{t}</text>')
    o.append(f'<g transform="translate(250 {piso-1}) scale(-0.66 0.66) translate(0 -232)">{cuerpo}</g>')
    o.append(f'<text x="20" y="{piso+14}" font-size="9" fill="#64748b">el clark entra por el pasillo →</text>')
    o.append('</svg>')
    return "\n".join(o)

open('selectivo.svg','w').write(selectivo())
open('penetrable.svg','w').write(penetrable())
