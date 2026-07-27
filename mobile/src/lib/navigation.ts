import { router, type Href } from "expo-router";

export function goBackOrReplace(fallbackHref: Href = "/") {
  router.replace(fallbackHref);
}
