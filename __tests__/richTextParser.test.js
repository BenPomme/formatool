const { parseRichTextSegments } = require('../dist/utils/richText');

describe('parseRichTextSegments', () => {
  it('splits text into segments tracking bold, italic, and color states', () => {
    const input = 'Start **bold [color=#FF0000]red *both*[/color] plain** done';

    const segments = parseRichTextSegments(input);

    expect(segments).toEqual([
      { text: 'Start ', bold: false, italic: false, color: undefined },
      { text: 'bold ', bold: true, italic: false, color: undefined },
      { text: 'red ', bold: true, italic: false, color: '#FF0000' },
      { text: 'both', bold: true, italic: true, color: '#FF0000' },
      { text: ' plain', bold: true, italic: false, color: undefined },
      { text: ' done', bold: false, italic: false, color: undefined }
    ]);
  });

  it('coalesces adjacent spans with identical styles', () => {
    const input = '**Bold** and **Bold** again';

    const segments = parseRichTextSegments(input);

    expect(segments).toEqual([
      { text: 'Bold', bold: true, italic: false, color: undefined },
      { text: ' and ', bold: false, italic: false, color: undefined },
      { text: 'Bold', bold: true, italic: false, color: undefined },
      { text: ' again', bold: false, italic: false, color: undefined }
    ]);
  });
});
