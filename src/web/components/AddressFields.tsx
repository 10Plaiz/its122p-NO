/// <reference types="google.maps" />
import { useEffect, useState } from "react";
import { APIProvider, useMapsLibrary } from "@vis.gl/react-google-maps";
import { ADDRESS_MAX } from "../lib/barangays.js";
import { composeAddress } from "../lib/address.js";
import { googleMapsApiKey, SEARCH_BOUNDS } from "../lib/maps.js";
import { RequiredMark } from "./AuthPanel.js";
import { Field, Input } from "./ui.js";

type Props = {
  house: string;
  street: string;
  barangay: string;
  onHouseChange: (value: string) => void;
  onStreetChange: (value: string) => void;
  error?: string;
};

export function AddressFields(props: Props) {
  const key = googleMapsApiKey();
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Field label="House / unit number" htmlFor="house-number" hint="Leave blank if your address has no number.">
        <Input id="house-number" name="house_number" maxLength={ADDRESS_MAX} value={props.house}
          onChange={(event) => props.onHouseChange(event.target.value)} />
      </Field>
      <Field label={<>Street / address <RequiredMark /></>} htmlFor="address" error={props.error}
        hint="Enter your street or complete address. Suggestions are optional."
        count={composeAddress(props.house, props.street).length} max={ADDRESS_MAX}>
        <Input id="address" name="address_line" required autoComplete="street-address" maxLength={ADDRESS_MAX}
          value={props.street} onChange={(event) => props.onStreetChange(event.target.value)} />
      </Field>
      {key ? (
        <APIProvider apiKey={key} region="PH" language="en">
          <StreetSuggestions key={props.barangay} {...props} />
        </APIProvider>
      ) : <p className="!m-0 text-muted text-[12px]">Street suggestions are unavailable. Enter your address manually.</p>}
    </div>
  );
}

function StreetSuggestions({ street, barangay, onStreetChange }: Props) {
  const places = useMapsLibrary("places");
  const [result, setResult] = useState<{ query: string; names: string[] } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!places || !barangay || street.trim().length < 3) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: `${street}, ${barangay}, Makati`,
          includedRegionCodes: ["ph"],
          locationRestriction: SEARCH_BOUNDS,
          includedPrimaryTypes: ["route", "street_address", "premise"],
        });
        if (!cancelled) {
          setFailed(false);
          setResult({ query: street, names: [...new Set(suggestions.flatMap(({ placePrediction }) =>
            placePrediction?.mainText ? [placePrediction.mainText.text] : []))] });
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [places, barangay, street]);
  const names = result?.query === street ? result.names : [];
  return (
    <div className="flex flex-col gap-2">
      <p role="status" className="!m-0 text-muted text-[12px]">
        {failed ? "Street suggestions are unavailable. Enter your address manually."
          : `Search suggestions use ${barangay || "your selected barangay"}, Makati. You can always type your address.`}
      </p>
      {names.length > 0 && <>
        <div className="flex flex-wrap gap-2" aria-label="Street suggestions">
          {names.map((name) => <button key={name} type="button" className="btn text-left"
            onClick={() => onStreetChange(name)}>{name}</button>)}
        </div>
        <img className="self-start" width="120" alt="Google Maps"
          src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png" />
      </>}
    </div>
  );
}
