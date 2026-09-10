/**
 * BOOTSTRAP — who may sign in.
 *
 * Applied with `npm run seed`. Idempotent: re-running only touches the
 * addresses named here. `admin: true` unlocks the Persona library (adding,
 * grounding, editing and removing advisors); everyone else chats privately
 * and convenes the board. `title` is the line under the name in the sidebar.
 */
export type RosterEntry = {
  name: string
  email: string
  title?: string
  admin?: boolean
  active?: boolean
}

export const ROSTER: RosterEntry[] = [
  { name: 'Hadi', email: 'hadi@itelligents.ca', title: 'Founder · Itelligents', admin: true },
  { name: 'Hadi (personal)', email: 'shayesteh_hadi@yahoo.com', title: 'Founder · Itelligents', admin: true },
]
