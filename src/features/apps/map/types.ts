export type Coordinate = [number, number];
export type TravelMode = 'driving' | 'transit' | 'walking' | 'riding';
export type DrawingTool = 'distance' | 'area' | 'marker' | 'polyline' | 'polygon' | 'rectangle' | 'circle';

export interface Place {
  id: string;
  name: string;
  location: Coordinate;
  address: string;
  city: string;
  district: string;
  type: string;
  phone?: string;
  distance?: number;
}

export interface PlaceSuggestion {
  id: string;
  name: string;
  district: string;
  location?: Coordinate;
}

export interface SearchRequest {
  keyword: string;
  city: string;
  page?: number;
  center?: Coordinate;
  radius?: number;
  type?: string;
}

export interface SearchResult {
  places: Place[];
  total: number;
  page: number;
}

export interface RouteRequest {
  mode: TravelMode;
  start: Place;
  end: Place;
  city: string;
  destinationCity: string;
  policy: number;
  waypoints: Place[];
}

export interface RouteStep {
  instruction: string;
  distance: number;
  duration: number;
  road?: string;
}

export interface RoutePlan {
  id: string;
  name: string;
  distance: number;
  duration: number;
  tolls?: number;
  fare?: number;
  taxiCost?: number;
  steps: RouteStep[];
  path: Coordinate[];
}

export interface LocationResult {
  place: Place;
  accuracy?: number;
  approximate: boolean;
}

export interface WeatherResult {
  city: string;
  weather: string;
  temperature: string;
  wind: string;
  humidity: string;
  reportTime: string;
  forecast: { date: string; dayWeather: string; nightWeather: string; low: string; high: string }[];
}

export interface DistrictResult {
  name: string;
  adcode: string;
  level: string;
  center: Coordinate;
  children: { name: string; adcode: string; level: string; center?: Coordinate }[];
}

export interface BusLine {
  id: string;
  name: string;
  start: string;
  end: string;
  first: string;
  last: string;
  price?: number;
  stops: { name: string; location?: Coordinate }[];
  path: Coordinate[];
}

export interface MapView {
  center: Coordinate;
  zoom: number;
}

export interface MapAppearance {
  base: 'standard' | 'satellite';
  traffic: boolean;
  roadNet: boolean;
  buildings: boolean;
  threeD: boolean;
  labels: boolean;
  style: 'normal' | 'whitesmoke' | 'dark';
}

export interface MapController {
  search(request: SearchRequest): Promise<SearchResult>;
  suggest(keyword: string, city: string): Promise<PlaceSuggestion[]>;
  resolve(keyword: string, city: string): Promise<Place>;
  reverse(location: Coordinate): Promise<Place>;
  locate(): Promise<LocationResult>;
  plan(request: RouteRequest): Promise<RoutePlan[]>;
  weather(city: string): Promise<WeatherResult>;
  district(keyword: string): Promise<DistrictResult>;
  bus(keyword: string, city: string): Promise<BusLine[]>;
  convert(location: Coordinate, source: 'gps' | 'baidu' | 'mapbar'): Promise<Coordinate>;
  showPlaces(places: Place[]): void;
  focus(place: Place): void;
  showRoute(plan: RoutePlan, request: RouteRequest): void;
  showBus(line: BusLine): void;
  clearRoute(): void;
  setAppearance(appearance: MapAppearance): void;
  setView(view: Partial<MapView>): void;
  getView(): MapView;
  fit(): void;
  draw(tool: DrawingTool): Promise<void>;
  stopDrawing(): void;
  clearDrawings(): void;
  destroy(): void;
}

export interface MapControllerOptions {
  container: HTMLElement;
  key: string;
  securityJsCode: string;
  initialView: MapView;
  getPadding?: () => [number, number, number, number];
  onPick: (location: Coordinate) => void;
  onPlace: (place: Place) => void;
  onMove: (view: MapView) => void;
  onToolResult: (message: string) => void;
}
