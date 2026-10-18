/**
 * dsh-web-tools — shared wire types between Host routes and the Client card.
 *
 * Single source of truth for the /web-tools/api contract, so Host return
 * shapes and Client consumption cannot drift apart.
 * @module
 */
/**
 * The click/keyboard cycle shared by the button and the `/search` command:
 * auto → required → off → auto. Keeping it in one place means the UI cannot
 * disagree with the slash command about what the next state is.
 */
export function nextSearchMode(mode) {
    if (mode === "auto")
        return "required";
    if (mode === "required")
        return "off";
    return "auto";
}
