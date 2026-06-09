'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Send } from 'lucide-react'

export function ContactForm({ email }: { email: string }) {
  const [name, setName] = useState('')
  const [from, setFrom] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const body = `Nom : ${name}\nEmail : ${from}\n\n${message}`
    const mailto = `mailto:${email}?subject=${encodeURIComponent(
      subject || 'Demande de contact'
    )}&body=${encodeURIComponent(body)}`
    window.location.href = mailto
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="c-name" className="text-sm font-medium text-zinc-700">Nom</Label>
          <Input
            id="c-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Votre nom"
            className="h-10"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-email" className="text-sm font-medium text-zinc-700">Email</Label>
          <Input
            id="c-email"
            type="email"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="vous@entreprise.com"
            className="h-10"
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="c-subject" className="text-sm font-medium text-zinc-700">Sujet</Label>
        <Input
          id="c-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Objet de votre message"
          className="h-10"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="c-message" className="text-sm font-medium text-zinc-700">Message</Label>
        <Textarea
          id="c-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Comment pouvons-nous vous aider ?"
          rows={5}
          required
        />
      </div>

      <Button type="submit" className="h-10 px-5 bg-zinc-950 hover:bg-zinc-800 text-white text-sm font-semibold">
        <Send className="h-4 w-4 mr-2" />
        Envoyer le message
      </Button>
      <p className="text-xs text-zinc-400">
        L&apos;envoi ouvre votre application de messagerie avec le message pré-rempli.
      </p>
    </form>
  )
}
