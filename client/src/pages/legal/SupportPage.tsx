import { Link } from "react-router";
import { LegalPublicLayout } from "./LegalPublicLayout";

export function SupportPage() {
  return (
    <LegalPublicLayout title="Support" updated="September 2, 2026">
      <p>
        Fantasy Football Rivals support is handled in the product. We do not publish a support
        email, phone number, Discord, or ticket inbox. Use the steps below, then{" "}
        <Link to="/sign-in" className="text-lime-400 hover:text-lime-300">
          sign in
        </Link>{" "}
        and open{" "}
        <Link to="/settings" className="text-lime-400 hover:text-lime-300">
          Settings
        </Link>{" "}
        or the connect flow for the remaining work.
      </p>

      <h2 className="text-lg font-bold text-white">Sign-in</h2>
      <p>
        Open{" "}
        <Link to="/sign-in" className="text-lime-400 hover:text-lime-300">
          Sign in
        </Link>{" "}
        on Fantasy Football Rivals. If Google keeps the wrong account, sign out of Rivals first so
        the next Google prompt can ask you to choose an account. Rivals sign-out does not sign you
        out of Google itself.
      </p>

      <h2 className="text-lg font-bold text-white">Fantasy Football Rivals — ESPN Connector</h2>
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          Open{" "}
          <Link to="/" className="text-lime-400 hover:text-lime-300">
            Fantasy Football Rivals
          </Link>{" "}
          and sign in.
        </li>
        <li>
          Choose ESPN at{" "}
          <Link to="/connect" className="text-lime-400 hover:text-lime-300">
            Where do you play?
          </Link>
        </li>
        <li>Install the ESPN Connector if the page asks you to. Connecting ESPN currently requires desktop Chrome.</li>
        <li>Sign into ESPN in this browser if you are signed out.</li>
        <li>Return to Rivals. The Connector detects your ESPN session and lists leagues you can access.</li>
        <li>If you have one league, Rivals connects it. If you have several, choose one.</li>
        <li>Select your team only if Rivals still needs that step.</li>
      </ol>

      <h2 className="text-lg font-bold text-white">Connector not detected</h2>
      <p>
        Confirm the Fantasy Football Rivals — ESPN Connector is installed and enabled in Chrome,
        then reload the Rivals tab. The connector is a desktop Chrome extension. There is no
        published Chrome Web Store listing URL yet — do not use a guessed store link.
      </p>

      <h2 className="text-lg font-bold text-white">ESPN is signed out</h2>
      <p>
        Sign in at ESPN in this same Chrome profile, then return to Rivals and try again. The
        Connector reads ESPN session cookies already in the browser; it cannot connect while those
        cookies are missing.
      </p>

      <h2 className="text-lg font-bold text-white">League not found</h2>
      <p>
        Confirm you are signed into the ESPN account that actually owns or can access the league.
        Private or hidden leagues ESPN does not return to that session will not appear.
      </p>

      <h2 className="text-lg font-bold text-white">Multiple ESPN leagues</h2>
      <p>If more than one league is found, Rivals asks you to choose one. That is expected.</p>

      <h2 className="text-lg font-bold text-white">Connection failed</h2>
      <p>
        Stay signed in to both Rivals and ESPN in this browser, then retry from{" "}
        <Link to="/connect/espn" className="text-lime-400 hover:text-lime-300">
          Connect ESPN
        </Link>
        . If the save still fails, sign out of Rivals, sign back in, and connect again.
      </p>

      <h2 className="text-lg font-bold text-white">Team selection</h2>
      <p>
        Team selection appears only when Rivals still needs to know which franchise is yours. Pick
        your team, then continue to the dashboard.
      </p>

      <h2 className="text-lg font-bold text-white">Sleeper</h2>
      <p>
        Sleeper does not use the ESPN Connector. Choose Sleeper at{" "}
        <Link to="/connect/sleeper" className="text-lime-400 hover:text-lime-300">
          Where do you play?
        </Link>{" "}
        and follow the in-product Sleeper steps.
      </p>

      <h2 className="text-lg font-bold text-white">Account, data, and privacy</h2>
      <p>
        After you sign in, Settings is where you review or disconnect leagues. The Privacy Policy
        explains what the ESPN Connector accesses:{" "}
        <Link to="/privacy" className="text-lime-400 hover:text-lime-300">
          Privacy
        </Link>
        .
      </p>
    </LegalPublicLayout>
  );
}
