/* AHT Global Change Log XLSX writer v2.1: schema-correct ordering, logo embedding, no CDN dependency. */
(function(global) {
  'use strict';
  const enc = new TextEncoder();
  const LOGO = 'aht-global-tools-logo.png';
  const xml = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const cell = (address, text, style, numeric=false) => {
    if (numeric && Number.isFinite(Number(text)) && String(text).trim() !== '')
      return `<c r="${address}" s="${style}"><v>${Number(text)}</v></c>`;
    return `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(text)}</t></is></c>`;
  };
  function sheetXml(rows, withLogo, toolLabel) {
    const heads = ['PDF Page', 'Room / Area', 'Room #', 'Change Note'];
    const body = [
      `<row r="1" ht="51" customHeight="1">${cell('A1',withLogo ? '' : 'AHT GLOBAL',withLogo ? 0 : 7)}${cell('C1','AHT PROJECT CHANGE LOG',1)}</row>`,
      `<row r="2" ht="28" customHeight="1">${cell('A2','PRELIMINARY  |  FOR REVIEW AND COORDINATION ONLY',2)}</row>`,
      `<row r="3" ht="28" customHeight="1">${cell('A3','Not a final AHT Global engineered design. Engineering review required.',3)}</row>`,
      `<row r="4" ht="27" customHeight="1">${cell('A4','TOOL USED: ' + toolLabel,9)}</row>`,
      `<row r="5" ht="28" customHeight="1">${heads.map((h,i)=>cell('ABCD'[i]+'5',h,4)).join('')}</row>`
    ];
    rows.slice(1).forEach((data, i) => {
      const r = i + 6;
      const alternate = i % 2 === 1;
      body.push(`<row r="${r}" ht="33" customHeight="1">` +
        data.slice(0,4).map((value,j) => cell('ABCD'[j]+r,value,
          (j===0 || j===2) ? (alternate?8:7) : (alternate?6:5), j===0)).join('') + '</row>');
    });
    const last = Math.max(5, rows.length + 4);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<dimension ref="A1:D${last}"/><sheetViews><sheetView workbookViewId="0">` +
      `<pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/>` +
      `</sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/>` +
      `<cols><col min="1" max="1" width="13" customWidth="1"/>` +
      `<col min="2" max="2" width="29" customWidth="1"/>` +
      `<col min="3" max="3" width="15" customWidth="1"/>` +
      `<col min="4" max="4" width="74" customWidth="1"/></cols>` +
      `<sheetData>${body.join('')}</sheetData>` +
      `<autoFilter ref="A5:D${last}"/>` +
      `<mergeCells count="5"><mergeCell ref="A1:B1"/><mergeCell ref="C1:D1"/><mergeCell ref="A2:D2"/><mergeCell ref="A3:D3"/><mergeCell ref="A4:D4"/></mergeCells>` +
      `<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>` +
      (withLogo ? `<drawing r:id="rId1"/>` : ``) +
      `</worksheet>`;
  }
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="6">` +
      `<font><sz val="11"/><name val="Aptos"/><color rgb="FF263748"/></font>` +
      `<font><b/><sz val="20"/><name val="Aptos Display"/><color rgb="FFFFFFFF"/></font>` +
      `<font><b/><sz val="13"/><name val="Aptos"/><color rgb="FFFFFFFF"/></font>` +
      `<font><sz val="10"/><name val="Aptos"/><color rgb="FF46677F"/></font>` +
      `<font><b/><sz val="11"/><name val="Aptos"/><color rgb="FFFFFFFF"/></font>` +
      `<font><b/><sz val="11"/><name val="Aptos"/><color rgb="FF234563"/></font>` +
    `</fonts><fills count="6">` +
      `<fill><patternFill patternType="none"/></fill>` +
      `<fill><patternFill patternType="gray125"/></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FF163B63"/><bgColor indexed="64"/></patternFill></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FF235C86"/><bgColor indexed="64"/></patternFill></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FFEAF3FA"/><bgColor indexed="64"/></patternFill></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FFF7FAFD"/><bgColor indexed="64"/></patternFill></fill>` +
    `</fills><borders count="2">` +
      `<border><left/><right/><top/><bottom/><diagonal/></border>` +
      `<border><left/><right/><top/><bottom style="hair"><color rgb="FFDCE5EC"/></bottom><diagonal/></border>` +
    `</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="10">` +
      `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
      `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" horizontal="center"/></xf>` +
      `<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>` +
      `<xf numFmtId="0" fontId="3" fillId="4" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>` +
      `<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>` +
      `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1" indent="1"/></xf>` +
      `<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1" indent="1"/></xf>` +
      `<xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" horizontal="center"/></xf>` +
      `<xf numFmtId="0" fontId="5" fillId="5" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" horizontal="center"/></xf>` +
      `<xf numFmtId="0" fontId="5" fillId="4" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>` +
    `</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`;
  const crcTable=Array.from({length:256}, (_,n)=>{
    for(let i=0;i<8;i++) n = (n&1) ? (0xEDB88320^(n>>>1)) : (n>>>1);
    return n>>>0;
  });
  function crc32(bytes){let c=0xFFFFFFFF;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
  const u16=(n)=>[n&255,(n>>>8)&255];
  const u32=(n)=>[n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];
  function makeZip(files){
    const local=[], central=[];let offset=0;
    for(const [name, value] of Object.entries(files)){
      const nameBytes=enc.encode(name), b=value instanceof Uint8Array ? value : enc.encode(value), crc=crc32(b);
      const hdr=new Uint8Array([0x50,0x4b,3,4,...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(b.length),...u32(b.length),...u16(nameBytes.length),...u16(0)]);
      local.push(hdr,nameBytes,b);
      const c=new Uint8Array([0x50,0x4b,1,2,...u16(20),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(b.length),...u32(b.length),...u16(nameBytes.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset)]);
      central.push(c,nameBytes);
      offset += hdr.length+nameBytes.length+b.length;
    }
    const centralLength=central.reduce((n,b)=>n+b.length,0), total=Object.keys(files).length;
    const end=new Uint8Array([0x50,0x4b,5,6,...u16(0),...u16(0),...u16(total),...u16(total),...u32(centralLength),...u32(offset),...u16(0)]);
    const parts=[...local,...central,end], output=new Uint8Array(offset+centralLength+end.length);let pos=0;
    for(const part of parts){output.set(part,pos);pos+=part.length;} return output;
  }
  const drawing = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`+
    `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">`+
    `<xdr:oneCellAnchor>`+
    `<xdr:from><xdr:col>0</xdr:col><xdr:colOff>114300</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>152400</xdr:rowOff></xdr:from>`+
    `<xdr:ext cx="2286000" cy="314325"/>`+
    `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="AHT Global Logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>`+
    `<xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId1"/>`+
    `<a:stretch><a:fillRect/></a:stretch></xdr:blipFill>`+
    `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2286000" cy="314325"/></a:xfrm>`+
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>`+
    `<xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`;
  async function build(rows, toolName){
    const toolLabel = String(toolName || "Device Markup").trim().slice(0,100) || "Device Markup";
    if(!Array.isArray(rows)||!rows.length||rows[0].length!==4) throw new Error('Four-column Change Log required');
    let logo = null;
    try {
      const result = await fetch(LOGO, {cache:'force-cache'});
      if (result.ok) logo = new Uint8Array(await result.arrayBuffer());
    } catch (e) { console.warn('AHT Excel logo could not load:',e); }
    const files={
      '[Content_Types].xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
      '_rels/.rels':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      'xl/workbook.xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="Change Log" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      'xl/styles.xml':styles,
      'xl/worksheets/sheet1.xml':sheetXml(rows, !!logo, toolLabel)
    };
    if (logo) {
      files['[Content_Types].xml'] = files['[Content_Types].xml'].replace('</Types>', '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>');
      files['xl/worksheets/_rels/sheet1.xml.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`;
      files['xl/drawings/drawing1.xml'] = drawing;
      files['xl/drawings/_rels/drawing1.xml.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>`;
      files['xl/media/image1.png'] = logo;
    }
    return makeZip(files);
  }
  global.AHTBrandXlsx={build};
})(window);
