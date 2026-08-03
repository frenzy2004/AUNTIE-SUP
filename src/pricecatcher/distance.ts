export const MEAN_EARTH_RADIUS_METRES = 6_371_008.8

export interface Coordinates {
  latitude: number
  longitude: number
}

const degreesToRadians = (degrees: number): number => degrees * Math.PI / 180

const assertCoordinates = (coordinates: Coordinates): void => {
  if (!Number.isFinite(coordinates.latitude) || !Number.isFinite(coordinates.longitude) ||
    coordinates.latitude < -90 || coordinates.latitude > 90 ||
    coordinates.longitude < -180 || coordinates.longitude > 180) {
    throw new RangeError('latitude and longitude must be finite and in range')
  }
}

export function haversineMetres(from: Coordinates, to: Coordinates): number {
  assertCoordinates(from)
  assertCoordinates(to)
  const latitudeDelta = degreesToRadians(to.latitude - from.latitude)
  const longitudeDelta = degreesToRadians(to.longitude - from.longitude)
  const fromLatitude = degreesToRadians(from.latitude)
  const toLatitude = degreesToRadians(to.latitude)
  const unclampedA = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2
  const a = Math.min(1, Math.max(0, unclampedA))
  const distance = MEAN_EARTH_RADIUS_METRES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.floor(distance + 0.5)
}
