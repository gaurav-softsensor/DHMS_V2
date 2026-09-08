#!/usr/bin/env python3
"""Assemble src/ + data/payload.json into deployable HTML.

Outputs (both self-contained -- no server, no build step to view):
  index.html            project root, a complete standalone page. This is what a
                        static host serves; drop the folder on any web root.
  dist/artifact.html    the same page WITHOUT <html>/<head>/<body>, because the
                        Artifact tool supplies that wrapper itself.

The data block MUST precede the script: app.js reads it by id on load.
"""
import json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, DATA, DIST = ROOT/'src', ROOT/'data', ROOT/'dist'

def main(standalone=True):
    head = (SRC/'head.html').read_text(encoding='utf8').rstrip()
    css  = (SRC/'styles.css').read_text(encoding='utf8').strip()
    body = (SRC/'body.html').read_text(encoding='utf8').strip()
    app  = (SRC/'app.js').read_text(encoding='utf8').strip()
    payload = json.loads((DATA/'payload.json').read_text(encoding='utf8'))
    blob = json.dumps(payload, separators=(',', ':'))
    if '</script' in blob:                      # never break out of the data block
        blob = blob.replace('</script', '<\\/script')

    parts = [head, '<style>', css, '</style>', body,
             '<script id="d" type="application/json">', blob, '</script>',
             '<script>', app, '</script>']
    out = '\n'.join(parts) + '\n'

    if standalone:                              # a complete, deployable document
        out = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
               '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
               '<meta name="description" content="NHAI project network by State, '
               'Regional Office, PIU and project.">\n'
               '<style>html,body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n'
               + out + '</body>\n</html>\n')
        target = ROOT/'index.html'              # served at the web root
    else:
        DIST.mkdir(exist_ok=True)
        target = DIST/'artifact.html"'.rstrip('"')
    target.write_text(out, encoding='utf8')
    print(f'{target.relative_to(ROOT)}  {len(out.encode())/1e6:.2f} MB  '
          f'({len(payload["projects"])} projects, {len(payload["states"])} states, '
          f'{len(payload["ros"])} ROs, {len(payload["pius"])} PIUs)')

if __name__ == '__main__':
    # default builds both: the deployable root page and the artifact variant
    if '--artifact-only' in sys.argv:
        main(standalone=False)
    else:
        main(standalone=True)
        main(standalone=False)
