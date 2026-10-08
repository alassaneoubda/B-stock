import { layoutTicket, type PaperWidth, type TicketData, type TicketRow } from '@/lib/print/ticket'

/**
 * Ticket thermique 58 / 80 mm en HTML (aperçu à l'écran et impression par le
 * navigateur). Styles autonomes en millimètres, noir sur blanc, indépendants
 * du thème : le rendu imprimé est identique en mode sombre.
 */

export const TICKET_CSS = `
.bst-ticket{box-sizing:border-box;background:#fff;color:#000;font-family:ui-monospace,"Cascadia Mono","Roboto Mono","Courier New",monospace;line-height:1.35;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.bst-ticket[data-w="58"]{width:58mm;padding:3mm 2.5mm;font-size:11px}
.bst-ticket[data-w="80"]{width:80mm;padding:3mm 4mm;font-size:12.5px}
.bst-ticket *{box-sizing:border-box}
.bst-ticket .bst-c{text-align:center;overflow-wrap:anywhere}
.bst-ticket .bst-t{overflow-wrap:anywhere}
.bst-ticket .bst-b{font-weight:700}
.bst-ticket .bst-big{font-size:1.3em}
.bst-ticket .bst-pair{display:flex;justify-content:space-between;align-items:baseline;gap:2mm}
.bst-ticket .bst-pair>span:first-child{min-width:0;overflow-wrap:anywhere;white-space:pre-wrap}
.bst-ticket .bst-pair>span:last-child{white-space:nowrap}
.bst-ticket .bst-rule{border:0;border-top:1px dashed #000;margin:1.5mm 0;height:0}
.bst-ticket .bst-feed{height:4mm}
.bst-ticket .bst-logo{display:block;max-width:60%;max-height:18mm;margin:0 auto 1.5mm;object-fit:contain;filter:grayscale(1) contrast(1.2)}
`

function Row({ row }: { row: TicketRow }) {
  switch (row.kind) {
    case 'logo':
      // eslint-disable-next-line @next/next/no-img-element
      return <img className="bst-logo" src={row.src} alt="" />
    case 'center':
      return <div className={['bst-c', row.bold && 'bst-b', row.big && 'bst-big'].filter(Boolean).join(' ')}>{row.text}</div>
    case 'text':
      return <div className="bst-t">{row.text}</div>
    case 'pair':
      return (
        <div className={['bst-pair', row.bold && 'bst-b', row.big && 'bst-big'].filter(Boolean).join(' ')}>
          <span>{row.left}</span>
          <span>{row.right}</span>
        </div>
      )
    case 'rule':
      return <hr className="bst-rule" />
    case 'feed':
      return <div className="bst-feed" />
  }
}

export function ThermalTicket({ data, width, showLogo = true }: { data: TicketData; width: PaperWidth; showLogo?: boolean }) {
  const rows = layoutTicket(data, { withLogo: showLogo })
  return (
    <div className="bst-ticket" data-w={width}>
      <style>{TICKET_CSS}</style>
      {rows.map((row, i) => (
        <Row key={i} row={row} />
      ))}
    </div>
  )
}
