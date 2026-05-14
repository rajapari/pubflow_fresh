import base64, os, subprocess, tempfile
from flask import Flask, request, jsonify

app = Flask(__name__)

FORMAT_EXT = {
    'docx':'.docx','latex':'.tex','markdown':'.md','odt':'.odt',
    'html':'.html','epub':'.epub','jats':'.xml','bibtex':'.bib',
}
PANDOC_FROM = {'docx':'docx','latex':'latex','markdown':'markdown','odt':'odt','html':'html'}
PANDOC_TO   = {'html':'html5','epub':'epub3','jats':'jats','docx':'docx',
               'latex':'latex','bibtex':'bibtex','markdown':'markdown'}

@app.route('/health')
def health():
    r = subprocess.run(['pandoc','--version'], capture_output=True, text=True)
    return jsonify({'status':'ok','pandoc': r.stdout.split('\n')[0]})

@app.route('/convert', methods=['POST'])
def convert():
    try:
        d = request.get_json(force=True)
        in_fmt  = d.get('inputFormat','docx')
        out_fmt = d.get('outputFormat','html')
        content = base64.b64decode(d.get('content',''))
        in_ext  = FORMAT_EXT.get(in_fmt,'.bin')
        out_ext = FORMAT_EXT.get(out_fmt,'.txt')

        with tempfile.TemporaryDirectory() as tmp:
            inp = os.path.join(tmp, f'input{in_ext}')
            out = os.path.join(tmp, f'output{out_ext}')
            open(inp,'wb').write(content)

            cmd = ['pandoc', inp,
                   '-f', PANDOC_FROM.get(in_fmt, in_fmt),
                   '-t', PANDOC_TO.get(out_fmt, out_fmt),
                   '-o', out, '--standalone']

            r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if r.returncode != 0:
                return jsonify({'error': r.stderr or 'Conversion failed'}), 500

            result = open(out,'rb').read()
            return jsonify({'content': base64.b64encode(result).decode(), 'format': out_fmt})

    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Timed out'}), 504
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=4000)
