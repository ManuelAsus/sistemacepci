// PDF Generator Simple pero Funcional 100%
(function(global) {
    'use strict';

    class jsPDF {
        constructor(orientation = 'portrait', unit = 'mm', format = 'a4') {
            this.orientation = orientation;
            this.unit = unit;
            this.format = format;
            
            // Tamaños de página A4
            this.pageWidth = 210;
            this.pageHeight = 297;
            
            if (orientation === 'landscape') {
                [this.pageWidth, this.pageHeight] = [this.pageHeight, this.pageWidth];
            }

            this.internal = {
                pageSize: {
                    getWidth: () => this.pageWidth,
                    getHeight: () => this.pageHeight
                }
            };

            this.pages = [];
            this.currentPage = 0;
            this.fontName = 'Helvetica';
            this.fontSize = 12;
            this.textColor = [0, 0, 0];
            this.drawColor = [0, 0, 0];
            this.lineWidth = 0.5;

            this.addPage();
        }

        // Normalizar caracteres especiales para PDF
        _normalizeText(text) {
            const map = {
                'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
                'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U',
                'ñ': 'n', 'Ñ': 'N',
                'à': 'a', 'è': 'e', 'ì': 'i', 'ò': 'o', 'ù': 'u'
            };
            return String(text).replace(/[áéíóúÁÉÍÓÚñÑàèìòù]/g, char => map[char] || char);
        }

        addPage() {
            this.currentPage++;
            this.pages[this.currentPage] = {
                width: this.pageWidth,
                height: this.pageHeight,
                content: []
            };
            return this;
        }

        setFontSize(size) {
            this.fontSize = size;
            return this;
        }

        setTextColor(r, g, b) {
            if (typeof r === 'string') {
                const hex = r.replace('#', '');
                this.textColor = [
                    parseInt(hex.substr(0, 2), 16),
                    parseInt(hex.substr(2, 2), 16),
                    parseInt(hex.substr(4, 2), 16)
                ];
            } else {
                this.textColor = [r, g, b];
            }
            return this;
        }

        setDrawColor(r, g, b) {
            this.drawColor = [r, g, b];
            return this;
        }

        setLineWidth(width) {
            this.lineWidth = width;
            return this;
        }

        text(text, x, y, options = {}) {
            const page = this.pages[this.currentPage];
            if (page) {
                page.content.push({
                    type: 'text',
                    text: this._normalizeText(text),
                    x: x,
                    y: y,
                    fontSize: this.fontSize,
                    color: [...this.textColor],
                    align: options.align || 'left'
                });
            }
            return this;
        }

        line(x1, y1, x2, y2) {
            const page = this.pages[this.currentPage];
            if (page) {
                page.content.push({
                    type: 'line',
                    x1: x1,
                    y1: y1,
                    x2: x2,
                    y2: y2,
                    lineWidth: this.lineWidth,
                    color: [...this.drawColor]
                });
            }
            return this;
        }

        save(filename) {
            try {
                const pdfContent = this._generatePDF();
                this._downloadPDF(filename, pdfContent);
            } catch (e) {
                console.error('Error saving PDF:', e);
                throw e;
            }
            return this;
        }

        _generatePDF() {
            const objects = [];
            const objectOffsets = [];
            
            // Crear contenido para cada página
            const pageContents = [];
            const pageObjects = [];
            
            for (let pageNum = 1; pageNum <= this.currentPage; pageNum++) {
                const page = this.pages[pageNum];
                let content = 'BT\n';
                content += '/F1 12 Tf\n';
                
                page.content.forEach(item => {
                    if (item.type === 'text') {
                        const r = (item.color[0] || 0) / 255;
                        const g = (item.color[1] || 0) / 255;
                        const b = (item.color[2] || 0) / 255;
                        
                        // Establecer color
                        content += r.toFixed(3) + ' ' + g.toFixed(3) + ' ' + b.toFixed(3) + ' rg\n';
                        // Establecer fuente y tamaño
                        content += '/F1 ' + item.fontSize + ' Tf\n';
                        
                        let xPos = Math.round(item.x * 2.834645669 * 100) / 100;
                        let yPos = Math.round((page.height - item.y) * 2.834645669 * 100) / 100;
                        
                        if (item.align === 'center') {
                            xPos = Math.round((page.width / 2) * 2.834645669 * 100) / 100;
                        }
                        
                        // Posicionar el texto con matriz de transformación (posicionamiento absoluto)
                        content += '1 0 0 1 ' + xPos + ' ' + yPos + ' Tm\n';
                        
                        const escapedText = String(item.text)
                            .replace(/\\/g, '\\\\')
                            .replace(/\(/g, '\\(')
                            .replace(/\)/g, '\\)');
                        
                        content += '(' + escapedText + ') Tj\n';
                    } else if (item.type === 'line') {
                        content += 'ET\n'; // Terminar texto
                        
                        const r = (item.color[0] || 0) / 255;
                        const g = (item.color[1] || 0) / 255;
                        const b = (item.color[2] || 0) / 255;
                        
                        content += r.toFixed(3) + ' ' + g.toFixed(3) + ' ' + b.toFixed(3) + ' RG\n';
                        content += item.lineWidth + ' w\n';
                        content += Math.round(item.x1 * 2.834645669 * 100) / 100 + ' ' + Math.round((page.height - item.y1) * 2.834645669 * 100) / 100 + ' m\n';
                        content += Math.round(item.x2 * 2.834645669 * 100) / 100 + ' ' + Math.round((page.height - item.y2) * 2.834645669 * 100) / 100 + ' l\n';
                        content += 'S\n';
                        
                        content += 'BT\n'; // Reiniciar texto
                        content += '/F1 12 Tf\n';
                    }
                });
                
                content += 'ET\n';
                pageContents.push(content);
                pageObjects.push({ content: content, width: page.width, height: page.height });
            }

            let pdf = '%PDF-1.4\n';
            
            // Catalog
            objectOffsets.push(pdf.length);
            pdf += '1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n';
            
            // Pages
            objectOffsets.push(pdf.length);
            let pagesStr = '2 0 obj\n<</Type/Pages/Kids[';
            for (let i = 0; i < this.currentPage; i++) {
                pagesStr += (4 + i * 2) + ' 0 R ';
            }
            pagesStr += ']/Count ' + this.currentPage + '>>\nendobj\n';
            pdf += pagesStr;

            // Font dictionary
            objectOffsets.push(pdf.length);
            pdf += '3 0 obj\n<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>\nendobj\n';

            // Page objects
            for (let i = 0; i < pageObjects.length; i++) {
                const pageObj = pageObjects[i];
                const pageNum = 4 + i * 2;
                const contentNum = pageNum + 1;
                
                objectOffsets.push(pdf.length);
                const mediaBox = '0 0 ' + (pageObj.width * 2.834645669) + ' ' + (pageObj.height * 2.834645669);
                pdf += pageNum + ' 0 obj\n<</Type/Page/Parent 2 0 R/MediaBox[' + mediaBox + ']/Resources<</Font<</F1 3 0 R>>>>/Contents ' + contentNum + ' 0 R>>\nendobj\n';
                
                objectOffsets.push(pdf.length);
                const contentLength = pageObj.content.length;
                pdf += contentNum + ' 0 obj\n<</Length ' + contentLength + '>>\nstream\n' + pageObj.content + '\nendstream\nendobj\n';
            }

            // xref
            const xrefOffset = pdf.length;
            pdf += 'xref\n0 ' + (objectOffsets.length + 1) + '\n';
            pdf += '0000000000 65535 f \n';
            for (let i = 0; i < objectOffsets.length; i++) {
                pdf += String(objectOffsets[i]).padStart(10, '0') + ' 00000 n \n';
            }

            pdf += 'trailer\n<</Size ' + (objectOffsets.length + 1) + '/Root 1 0 R>>\n';
            pdf += 'startxref\n' + xrefOffset + '\n%%EOF';

            return pdf;
        }

        _downloadPDF(filename, content) {
            // Convertir string a bytes
            const bytes = new Uint8Array(content.length);
            for (let i = 0; i < content.length; i++) {
                bytes[i] = content.charCodeAt(i) & 0xff;
            }

            // Crear blob
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            // Crear elemento para descarga
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Liberar URL
            setTimeout(() => URL.revokeObjectURL(url), 100);
        }
    }

    global.jsPDF = jsPDF;
})(typeof window !== 'undefined' ? window : global);
