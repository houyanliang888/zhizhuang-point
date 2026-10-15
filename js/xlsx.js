/* ===========================================================
   纯 JS 生成 .xlsx（无依赖、离线可用）
   原理：手写 ZIP（store 模式）+ 最小 OOXML 表格结构
   =========================================================== */

var XLSX_UTIL = (function () {
  var crcTable = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) { c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); }
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(u8) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) { c = crcTable[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function enc(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var s = unescape(encodeURIComponent(str)), a = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }

  function zip(files) {
    var chunks = [], central = [], offset = 0, d = new Date();
    var time = ((d.getHours() & 0xFF) << 8) | ((d.getMinutes() & 0xFF) << 2) | ((d.getSeconds() / 2) & 0x1F);
    var date = (((d.getFullYear() - 1980) & 0x7F) << 9) | (((d.getMonth() + 1) & 0xF) << 5) | (d.getDate() & 0x1F);

    files.forEach(function (f) {
      var name = enc(f.name), data = f.data, crc = crc32(data);

      var lh = new Uint8Array(30), v = new DataView(lh.buffer);
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true);
      v.setUint16(8, 0, true); v.setUint16(10, time, true); v.setUint16(12, date, true);
      v.setUint32(14, crc, true); v.setUint32(18, data.length, true); v.setUint32(22, data.length, true);
      v.setUint16(26, name.length, true); v.setUint16(28, 0, true);

      chunks.push(lh, name, data);

      var cd = new Uint8Array(46), cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true); cv.setUint16(12, time, true);
      cv.setUint16(14, date, true); cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true);
      cv.setUint16(30, 0, true); cv.setUint16(32, 0, true); cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true); cv.setUint32(38, 0, true); cv.setUint32(42, offset, true);
      central.push(cd, name);

      offset += lh.length + name.length + data.length;
    });

    var cdSize = central.reduce(function (a, b) { return a + b.length; }, 0);
    var eocd = new Uint8Array(22), ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(4, 0, true); ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true); ev.setUint16(20, 0, true);

    return chunks.concat(central, [eocd]);
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function colName(i) {
    var s = '';
    i++;
    while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }

  /* sheets: [{ name, rows:[[{v,s}] or [value]], widths:[], merged:[{a,b}] }] */
  function build(sheets) {
    var files = [];
    files.push({ name: '[Content_Types].xml', data: enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>') });

    files.push({ name: '_rels/.rels', data: enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>') });

    files.push({ name: 'xl/workbook.xml', data: enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets>' + sheets.map(function (s, i) { return '<sheet name="' + esc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') +
      '</sheets></workbook>') });

    files.push({ name: 'xl/_rels/workbook.xml.rels', data: enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
      '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>') });

    /* styles: 0默认 1表头 2加粗合计 3货币 */
    files.push({ name: 'xl/styles.xml', data: enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="1"><numFmt numFmtId="176" formatCode="&quot;¥&quot;#,##0.00"/></numFmts>' +
      '<fonts count="3"><font><sz val="11"/><color rgb="FF1F2937"/><name val="微软雅黑"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FF1F2937"/><name val="微软雅黑"/></font>' +
      '<font><b/><sz val="12"/><color rgb="FF1F2937"/><name val="微软雅黑"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF7"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left style="thin"><color rgb="FFBFCada"/></left><right style="thin"><color rgb="FFBFCada"/></right>' +
      '<top style="thin"><color rgb="FFBFCada"/></top><bottom style="thin"><color rgb="FFBFCada"/></bottom><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="4">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>' +
      '<xf numFmtId="176" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
      '</cellXfs><cellStyles count="1"><cellStyle name="常规" xfId="0" builtinId="0"/></cellStyles></styleSheet>') });

    sheets.forEach(function (s, si) {
      var body = s.rows.map(function (row, ri) {
        var cells = row.map(function (cell, ci) {
          var val = (cell && typeof cell === 'object') ? cell.v : cell;
          var st = (cell && typeof cell === 'object' && cell.s !== undefined) ? cell.s : (ri === 0 ? 1 : 0);
          var ref = colName(ci) + (ri + 1);
          if (typeof val === 'number' && isFinite(val)) {
            return '<c r="' + ref + '" s="' + st + '"><v>' + val + '</v></c>';
          }
          if (val === null || val === undefined || val === '') return '<c r="' + ref + '" s="' + st + '"/>';
          /* 公式：以 = 开头的字符串原样写成公式，Excel 打开自动计算 */
          if (typeof val === 'string' && val.charAt(0) === '=') {
            return '<c r="' + ref + '" s="' + st + '"><f>' + esc(val.slice(1)) + '</f></c>';
          }
          return '<c r="' + ref + '" s="' + st + '" t="inlineStr"><is><t xml:space="preserve">' + esc(val) + '</t></is></c>';
        }).join('');
        return '<row r="' + (ri + 1) + '">' + cells + '</row>';
      }).join('');

      var cols = (s.widths && s.widths.length) ? '<cols>' + s.widths.map(function (w, i) {
        return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
      }).join('') + '</cols>' : '';

      var merge = (s.merged && s.merged.length) ? '<mergeCells count="' + s.merged.length + '">' + s.merged.map(function (m) {
        return '<mergeCell ref="' + m.a + ':' + m.b + '"/>';
      }).join('') + '</mergeCells>' : '';

      files.push({ name: 'xl/worksheets/sheet' + (si + 1) + '.xml', data: enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + cols +
        '<sheetData>' + body + '</sheetData>' + merge + '</worksheet>') });
    });

    return zip(files);
  }

  function download(parts, filename) {
    var blob = new Blob(parts, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 500);
  }

  return { build: build, download: download, enc: enc };
})();
