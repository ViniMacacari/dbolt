import { Injectable } from '@angular/core'

export interface QueryResultExportPayload {
  columns: string[]
  rows: any[][]
}

@Injectable({
  providedIn: 'root'
})
export class QueryResultExportService {
  async copyText(text: string): Promise<void> {
    await this.writeTextToClipboard(text)
  }

  async copyData(payload: QueryResultExportPayload): Promise<void> {
    await this.writeTextToClipboard(this.toTsv(payload.rows))
  }

  async copyTable(payload: QueryResultExportPayload): Promise<void> {
    const html = this.toHtmlTable(payload)
    const text = this.toMarkdownTable(payload)
    const clipboardItem = (window as any).ClipboardItem

    if (navigator.clipboard?.write && clipboardItem) {
      await navigator.clipboard.write([
        new clipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' })
        })
      ])
      return
    }

    await this.writeTextToClipboard(text)
  }

  exportXlsx(payload: QueryResultExportPayload, filename: string = 'query-result.xlsx'): void {
    const entries = this.buildXlsxEntries(payload)
    const blob = new Blob([this.createZip(entries)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })

    this.downloadBlob(blob, filename)
  }

  private async writeTextToClipboard(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }

    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }

  private toTsv(rows: any[][]): string {
    return rows
      .map((row) => row.map((value) => this.toDelimitedValue(value)).join('\t'))
      .join('\n')
  }

  private toMarkdownTable(payload: QueryResultExportPayload): string {
    const header = payload.columns.map((column) => this.escapeMarkdownCell(column))
    const divider = payload.columns.map(() => '---')
    const rows = payload.rows.map((row) => row.map((value) => this.escapeMarkdownCell(this.formatValue(value))))

    return [header, divider, ...rows]
      .map((row) => `| ${row.join(' | ')} |`)
      .join('\n')
  }

  private toHtmlTable(payload: QueryResultExportPayload): string {
    const headers = payload.columns
      .map((column) => `<th>${this.escapeHtml(column)}</th>`)
      .join('')
    const rows = payload.rows
      .map((row) => `<tr>${row.map((value) => `<td>${this.escapeHtml(this.formatValue(value))}</td>`).join('')}</tr>`)
      .join('')

    return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`
  }

  private buildXlsxEntries(payload: QueryResultExportPayload): Record<string, string> {
    return {
      '[Content_Types].xml': this.contentTypesXml(),
      '_rels/.rels': this.rootRelationshipsXml(),
      'xl/workbook.xml': this.workbookXml(),
      'xl/_rels/workbook.xml.rels': this.workbookRelationshipsXml(),
      'xl/styles.xml': this.stylesXml(),
      'xl/worksheets/sheet1.xml': this.sheetXml(payload)
    }
  }

  private contentTypesXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`
  }

  private rootRelationshipsXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
  }

  private workbookXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Results" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`
  }

  private workbookRelationshipsXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
  }

  private stylesXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`
  }

  private sheetXml(payload: QueryResultExportPayload): string {
    const rows = [payload.columns, ...payload.rows]
    const xmlRows = rows
      .map((row, rowIndex) => {
        const rowNumber = rowIndex + 1
        const cells = row
          .map((value, columnIndex) => this.xlsxCell(value, rowNumber, columnIndex))
          .join('')
        return `<row r="${rowNumber}">${cells}</row>`
      })
      .join('')

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${xmlRows}</sheetData>
</worksheet>`
  }

  private xlsxCell(value: any, rowNumber: number, columnIndex: number): string {
    const reference = `${this.columnName(columnIndex)}${rowNumber}`
    return `<c r="${reference}" t="inlineStr"><is><t>${this.escapeXml(this.formatValue(value))}</t></is></c>`
  }

  private createZip(entries: Record<string, string>): Uint8Array {
    const encoder = new TextEncoder()
    const localParts: Uint8Array[] = []
    const centralParts: Uint8Array[] = []
    let offset = 0

    Object.entries(entries).forEach(([filename, content]) => {
      const name = encoder.encode(filename)
      const data = encoder.encode(content)
      const crc = this.crc32(data)
      const localHeader = this.zipLocalHeader(name, data.length, crc)
      const centralHeader = this.zipCentralHeader(name, data.length, crc, offset)

      localParts.push(localHeader, data)
      centralParts.push(centralHeader)
      offset += localHeader.length + data.length
    })

    const centralDirectorySize = centralParts.reduce((total, part) => total + part.length, 0)
    const endRecord = this.zipEndRecord(Object.keys(entries).length, centralDirectorySize, offset)

    return this.concatBytes([...localParts, ...centralParts, endRecord])
  }

  private zipLocalHeader(name: Uint8Array, size: number, crc: number): Uint8Array {
    const header = new Uint8Array(30 + name.length)
    const view = new DataView(header.buffer)
    view.setUint32(0, 0x04034b50, true)
    view.setUint16(4, 20, true)
    view.setUint16(6, 0, true)
    view.setUint16(8, 0, true)
    view.setUint16(10, this.dosTime(), true)
    view.setUint16(12, this.dosDate(), true)
    view.setUint32(14, crc, true)
    view.setUint32(18, size, true)
    view.setUint32(22, size, true)
    view.setUint16(26, name.length, true)
    header.set(name, 30)
    return header
  }

  private zipCentralHeader(name: Uint8Array, size: number, crc: number, offset: number): Uint8Array {
    const header = new Uint8Array(46 + name.length)
    const view = new DataView(header.buffer)
    view.setUint32(0, 0x02014b50, true)
    view.setUint16(4, 20, true)
    view.setUint16(6, 20, true)
    view.setUint16(8, 0, true)
    view.setUint16(10, 0, true)
    view.setUint16(12, this.dosTime(), true)
    view.setUint16(14, this.dosDate(), true)
    view.setUint32(16, crc, true)
    view.setUint32(20, size, true)
    view.setUint32(24, size, true)
    view.setUint16(28, name.length, true)
    view.setUint32(42, offset, true)
    header.set(name, 46)
    return header
  }

  private zipEndRecord(entryCount: number, centralDirectorySize: number, centralDirectoryOffset: number): Uint8Array {
    const header = new Uint8Array(22)
    const view = new DataView(header.buffer)
    view.setUint32(0, 0x06054b50, true)
    view.setUint16(8, entryCount, true)
    view.setUint16(10, entryCount, true)
    view.setUint32(12, centralDirectorySize, true)
    view.setUint32(16, centralDirectoryOffset, true)
    return header
  }

  private crc32(data: Uint8Array): number {
    let crc = 0xffffffff

    for (const byte of data) {
      crc ^= byte
      for (let index = 0; index < 8; index++) {
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
      }
    }

    return (crc ^ 0xffffffff) >>> 0
  }

  private concatBytes(parts: Uint8Array[]): Uint8Array {
    const totalLength = parts.reduce((total, part) => total + part.length, 0)
    const output = new Uint8Array(totalLength)
    let offset = 0

    parts.forEach((part) => {
      output.set(part, offset)
      offset += part.length
    })

    return output
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  private dosDate(date = new Date()): number {
    return ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  }

  private dosTime(date = new Date()): number {
    return (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  }

  private columnName(index: number): string {
    let column = ''
    let current = index + 1

    while (current > 0) {
      const remainder = (current - 1) % 26
      column = String.fromCharCode(65 + remainder) + column
      current = Math.floor((current - 1) / 26)
    }

    return column
  }

  private toDelimitedValue(value: any): string {
    const formatted = this.formatValue(value)
    if (!/[\t\n\r"]/.test(formatted)) return formatted

    return `"${formatted.replace(/"/g, '""')}"`
  }

  private formatValue(value: any): string {
    if (value === null || value === undefined) return ''
    if (value instanceof Date) return value.toISOString()
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  private escapeXml(value: string): string {
    return this.escapeHtml(value)
  }

  private escapeMarkdownCell(value: string): string {
    return value.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')
  }
}
