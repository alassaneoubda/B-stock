'use client'

/**
 * Impression directe ESC/POS via Web Bluetooth (Bluetooth Low Energy).
 *
 * Disponible sur Chrome / Edge Android et desktop, en https. Non disponible
 * sur iOS (Safari) ni Firefox : l'appelant se replie alors sur l'impression
 * du navigateur. Les imprimantes « Bluetooth classique » uniquement (SPP, sans
 * BLE) ne sont pas joignables depuis un navigateur.
 */

// Web Bluetooth n'est pas décrit par lib.dom de TypeScript : types minimaux
type BtCharacteristic = {
  uuid: string
  properties: { write: boolean; writeWithoutResponse: boolean }
  writeValueWithoutResponse?: (data: BufferSource) => Promise<void>
  writeValueWithResponse?: (data: BufferSource) => Promise<void>
  writeValue: (data: BufferSource) => Promise<void>
}
type BtService = { uuid: string; getCharacteristics: () => Promise<BtCharacteristic[]> }
type BtServer = { connected: boolean; connect: () => Promise<BtServer>; getPrimaryServices: () => Promise<BtService[]> }
type BtDevice = { id: string; name?: string; gatt?: BtServer }
type BtNavigator = {
  bluetooth?: {
    getAvailability?: () => Promise<boolean>
    requestDevice: (options: { acceptAllDevices?: boolean; filters?: unknown[]; optionalServices?: string[] }) => Promise<BtDevice>
  }
}

/** Services GATT des puces BLE des imprimantes thermiques les plus répandues. */
const PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // la plupart des imprimantes chinoises (caractéristique 2af1)
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Xprinter / imprimantes « BT Printer »
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // puces ISSC / Microchip
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb', // modules HM-10
  '0000fee7-0000-1000-8000-00805f9b34fb',
]

const CHUNK_SIZE = 180

let current: { device: BtDevice; characteristic: BtCharacteristic } | null = null

function bluetooth() {
  if (typeof navigator === 'undefined') return undefined
  return (navigator as unknown as BtNavigator).bluetooth
}

export function isBluetoothPrintingSupported(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && Boolean(bluetooth())
}

export function connectedPrinterName(): string | null {
  return current?.device.gatt?.connected ? current.device.name || 'Imprimante Bluetooth' : null
}

async function findWritable(server: BtServer): Promise<BtCharacteristic> {
  const services = await server.getPrimaryServices()
  for (const service of services) {
    const chars = await service.getCharacteristics().catch(() => [] as BtCharacteristic[])
    const writable = chars.find((c) => c.properties.writeWithoutResponse) ?? chars.find((c) => c.properties.write)
    if (writable) return writable
  }
  throw new Error('Cette imprimante n’expose pas de canal d’impression Bluetooth compatible.')
}

async function connect(device: BtDevice) {
  if (!device.gatt) throw new Error('Appareil Bluetooth non compatible.')
  const server = device.gatt.connected ? device.gatt : await device.gatt.connect()
  const characteristic = await findWritable(server)
  // L'appareil reste mémorisé pour la session : reconnexion au prochain ticket
  current = { device, characteristic }
  return current
}

/** Ouvre le sélecteur Bluetooth du navigateur (doit suivre un clic de l'utilisateur). */
export async function pairPrinter(): Promise<string> {
  const bt = bluetooth()
  if (!bt) throw new Error('Impression Bluetooth non disponible sur ce navigateur.')
  const device = await bt.requestDevice({ acceptAllDevices: true, optionalServices: PRINTER_SERVICES })
  await connect(device)
  return device.name || 'Imprimante Bluetooth'
}

async function write(characteristic: BtCharacteristic, data: Uint8Array) {
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.slice(i, i + CHUNK_SIZE)
    if (characteristic.properties.writeWithoutResponse && characteristic.writeValueWithoutResponse) {
      await characteristic.writeValueWithoutResponse(chunk)
      // Laisse le tampon de l'imprimante se vider (les puces bon marché saturent vite)
      await new Promise((r) => setTimeout(r, 20))
    } else if (characteristic.writeValueWithResponse) {
      await characteristic.writeValueWithResponse(chunk)
    } else {
      await characteristic.writeValue(chunk)
    }
  }
}

/**
 * Envoie les octets à l'imprimante mémorisée (reconnexion automatique), ou
 * demande d'en choisir une. Lève une erreur au message lisible en cas d'échec.
 */
export async function printBytes(data: Uint8Array): Promise<void> {
  try {
    const target = current ? await connect(current.device) : null
    if (!target) {
      await pairPrinter()
    }
    await write(current!.characteristic, data)
  } catch (e) {
    const name = (e as { name?: string })?.name
    if (name === 'NotFoundError') throw new Error('Aucune imprimante sélectionnée.')
    if (name === 'SecurityError') throw new Error('Bluetooth bloqué par le navigateur pour ce site.')
    if (name === 'NetworkError') {
      current = null
      throw new Error('Imprimante injoignable : vérifiez qu’elle est allumée et à proximité.')
    }
    throw e instanceof Error ? e : new Error('Impression Bluetooth impossible.')
  }
}

export function forgetPrinter() {
  current = null
}
