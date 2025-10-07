#!/usr/bin/env python3
import requests
import json

# Upload files
files = {
    'referenceDocument': ('SOLSTOR IBERIA.docx', open('SOLSTOR IBERIA.docx', 'rb')),
    'targetDocument': ('target.docx', open('uploads/54a9c42b-cc48-4612-8ff6-ee5cadff8563.docx', 'rb'))
}

response = requests.post('http://localhost:3001/api/dual/upload-dual', files=files)
data = response.json()

print('Session ID:', data.get('sessionId', 'N/A'))
print('\nStyle Extraction:')
style = data.get('styleExtraction', {})
print('  Success:', style.get('success'))
print('  Confidence:', style.get('confidence'))
print('\nRaw DOCX Styles:')
raw = style.get('rawDocxStyles', {})
if raw:
    print('  Fonts:', raw.get('fonts', []))
    print('  Default Font:', raw.get('defaultFont'))
    print('  Font Sizes:', raw.get('fontSizes', []))
    print('  Colors:', raw.get('colors', []))
else:
    print('  No raw styles found')
print('\nSimplified Styles:')
simplified = style.get('simplifiedStyles', {})
if simplified:
    print('  Font:', simplified.get('font'))
    print('  Font Size:', simplified.get('fontSize'))
    print('  Colors:', simplified.get('colors', {}))
else:
    print('  No simplified styles found')

# Close files
files['referenceDocument'][1].close()
files['targetDocument'][1].close()