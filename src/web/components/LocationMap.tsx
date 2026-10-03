import { AdvancedMarker, Map } from "@vis.gl/react-google-maps";
import { DETAIL_ZOOM, MAP_RESTRICTION, MIN_ZOOM, googleMapId } from "../lib/maps.js";
import type { ReportStatus } from "../lib/types.js";
import { MakatiOutline, MapFrame } from "./MapFrame.js";
import { StatusPin } from "./StatusPin.js";

// One report's location, read-only, for the report detail screens: where the
// citizen pinned it, in the colour of its status. Used by ReportDetail and
// StaffReport. Fills its parent, which supplies the height.
export function LocationMap({
  latitude,
  longitude,
  status,
  title,
}: {
  latitude: number;
  longitude: number;
  status: ReportStatus;
  /** Read out for the pin, e.g. the report's title. */
  title: string;
}) {
  const position = { lat: latitude, lng: longitude };

  return (
    // Without a map the coordinates are still the location, so they are what is left.
    <MapFrame unavailable={`Pinned at ${latitude.toFixed(5)}, ${longitude.toFixed(5)}.`}>
      <Map
        // Keyed on the point: the camera props are defaults, so a different report in
        // the same frame needs a fresh map to be centred on it.
        key={`${latitude},${longitude}`}
        mapId={googleMapId()}
        defaultCenter={position}
        defaultZoom={DETAIL_ZOOM}
        minZoom={MIN_ZOOM}
        restriction={MAP_RESTRICTION}
        // Inside a scrolling page: one finger scrolls the page, two move the map.
        gestureHandling="cooperative"
        clickableIcons={false}
        mapTypeControl={false}
        streetViewControl={false}
        className="h-full w-full"
      >
        <MakatiOutline />
        <AdvancedMarker position={position} title={title} anchorLeft="-50%" anchorTop="-50%">
          {/* Larger than the board's pins: it is the only one, among Google's place icons. */}
          <StatusPin status={status} size={22} />
        </AdvancedMarker>
      </Map>
    </MapFrame>
  );
}
