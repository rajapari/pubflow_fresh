import base64, os, subprocess, tempfile
from flask import Flask, request, jsonify

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024  # 200MB — ported .cls resources can embed fonts

@app.route('/health')
def health():
    return jsonify({'status': 'ok', 'engine': 'xelatex'})

@app.route('/compile', methods=['POST'])
def compile_latex():
    try:
        d      = request.get_json(force=True)
        # Accept both keys: the worker historically sent 'latex'.
        source = d.get('source') or d.get('latex', '')
        engine = d.get('engine', 'xelatex')
        passes = min(int(d.get('passes', 2)), 4)
        # Extra files compiled alongside the source (ported .cls templates,
        # .bib files, logos…): {filename: base64}.
        resources = d.get('resources') or {}

        if engine not in ['xelatex', 'lualatex', 'pdflatex']:
            return jsonify({'error': 'Invalid engine'}), 400

        with tempfile.TemporaryDirectory() as tmp:
            tex = os.path.join(tmp, 'doc.tex')
            pdf = os.path.join(tmp, 'doc.pdf')
            open(tex, 'w', encoding='utf-8').write(source)

            for fname, b64 in resources.items():
                safe = os.path.basename(str(fname))
                if not safe:
                    continue
                open(os.path.join(tmp, safe), 'wb').write(base64.b64decode(b64))

            logs = []
            errors = []
            for i in range(passes):
                r = subprocess.run(
                    [engine, '-interaction=nonstopmode', '-halt-on-error',
                     '-output-directory', tmp, tex],
                    capture_output=True, text=True, timeout=240, cwd=tmp)
                logs.append(f'Pass {i+1}:\n{r.stdout}')
                # Every pass matters, not just the first: passes 2+ resolve
                # cross-refs/TOC/bibliography, and a failure there was
                # previously ignored as long as pass 1 had already written a
                # (now stale) PDF — silently returning outdated output as
                # success.
                if r.returncode != 0:
                    return jsonify({'error': f'Compile failed on pass {i+1}', 'log': '\n'.join(logs),
                                    'errors': [f'Compile failed on pass {i+1}'], 'logs': '\n'.join(logs)}), 500

            if not os.path.exists(pdf):
                return jsonify({'error': 'PDF not generated', 'log': '\n'.join(logs),
                                'errors': ['PDF not generated'], 'logs': '\n'.join(logs)}), 500

            pdf_bytes = open(pdf,'rb').read()
            return jsonify({'pdf': base64.b64encode(pdf_bytes).decode(),
                            'size': len(pdf_bytes),
                            'logs': '\n'.join(logs),
                            'errors': errors,
                            'metadata': {'engine': engine, 'passes': passes}})

    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Timed out (240s)'}), 504
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)
