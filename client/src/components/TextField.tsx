import type { InputHTMLAttributes } from 'react'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
}

export function TextField({ label, id, ...inputProps }: TextFieldProps) {
  const inputId = id ?? `field-${inputProps.name}`
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <input id={inputId} {...inputProps} />
    </div>
  )
}
