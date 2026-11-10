const avatarPalette = [
  ['#E7F8FF', '#468095'],
  ['#EAF8ED', '#438A51'],
  ['#FBF1E4', '#A56E29'],
  ['#FDECEC', '#A54B43'],
  ['#F2F3F4', '#686D7D'],
]

export function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

export function avatarColors(name: string) {
  const hash = [...name].reduce((total, char) => total + char.charCodeAt(0), 0)
  const [backgroundColor, color] = avatarPalette[hash % avatarPalette.length]
  return { backgroundColor, color }
}
