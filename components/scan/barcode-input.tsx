'use client'

import type { ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { normalizeBarcode } from './barcode-format'
import { ScanButton } from './barcode-scanner'

type BarcodeInputProps = Omit<ComponentProps<typeof Input>, 'value' | 'onChange'> & {
  value: string
  onChange: (value: string) => void
}

/**
 * Champ « Code-barres » : saisie au clavier, lecteur USB/Bluetooth (l'Entrée
 * finale ne soumet pas le formulaire) ou scan à la caméra.
 */
export function BarcodeInput({ value, onChange, className, disabled, ...inputProps }: BarcodeInputProps) {
  return (
    <div className="flex gap-2" data-scanner-ignore>
      <Input
        {...inputProps}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.preventDefault()
        }}
        onBlur={() => {
          const clean = normalizeBarcode(value)
          if (clean !== value) onChange(clean)
        }}
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        maxLength={100}
        className={cn('font-mono', className)}
      />
      <ScanButton
        iconOnly
        size="icon"
        className="shrink-0"
        label="Scanner le code-barres"
        title="Scanner le code-barres"
        description="Placez le code-barres de l’article dans le cadre."
        disabled={disabled}
        onDetected={(code) => {
          onChange(code)
          return { ok: true, message: 'Code enregistré dans le champ' }
        }}
      />
    </div>
  )
}
