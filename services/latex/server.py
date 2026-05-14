import base64, os, subprocess, tempfile
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/health')
def health():
    return jsonify({'status': 'ok', 'engine': 'xelatex'})

@app.route('/compile', methods=['POST'])
def compile_latex():
    try:
        d      = request.get_json(force=True)
        source = d.get('source', '')
        engine = d.get('engine', 'xelatex')
        passes = min(int(d.get('passes', 2)), 4)

        if engine not in ['xelatex', 'lualatex', 'pdflatex']:
            return jsonify({'error': 'Invalid engine'}), 400

        with tempfile.TemporaryDirectory() as tmp:
            tex = os.path.join(tmp, 'doc.tex')
            pdf = os.path.join(tmp, 'doc.pdf')
            open(tex, 'w', encoding='utf-8').write(source)

            logs = []
            for i in range(passes):
                r = subprocess.run(
                    [engine, '-interaction=nonstopmode', '-halt-on-error',
                     '-output-directory', tmp, tex],
                    capture_output=True, text=True, timeout=240, cwd=tmp)
                logs.append(f'Pass {i+1}:\n{r.stdout}')
                if r.returncode != 0 and i == 0:
                    return jsonify({'error': 'Compile failed', 'log': '\n'.join(logs)}), 500

            if not os.path.exists(pdf):
                return jsonify({'error': 'PDF not generated', 'log': '\n'.join(logs)}), 500

            pdf_bytes = open(pdf,'rb').read()
            return jsonify({'pdf': base64.b64encode(pdf_bytes).decode(), 'size': len(pdf_bytes)})

    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Timed out (240s)'}), 504
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)
