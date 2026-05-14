import json, os, sys
try:
    import scribus
except ImportError:
    print("Must run inside Scribus", file=sys.stderr)
    sys.exit(1)

def main():
    content_path = os.environ.get('PUBFLOW_CONTENT_PATH')
    output_path  = os.environ.get('PUBFLOW_OUTPUT_PATH')
    if not content_path or not output_path:
        sys.exit(1)

    payload = json.load(open(content_path))
    content = payload.get('content', {})

    if scribus.objectExists('MainText'):
        scribus.setText(content.get('body', ''), 'MainText')
    if scribus.objectExists('TitleFrame') and content.get('title'):
        scribus.setText(content['title'], 'TitleFrame')

    pdf = scribus.PDFfile()
    pdf.file = output_path
    pdf.version = 14
    pdf.useDocBleeds = True
    pdf.cropMarks = True
    pdf.save()

main()
