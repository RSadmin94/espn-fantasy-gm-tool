import { Link } from "react-router";
import { LegalPublicLayout } from "./LegalPublicLayout";

export function PrivacyPolicyPage() {
  return (
    <LegalPublicLayout title="Privacy Policy" updated="September 2, 2026">
      <p>
        This policy describes how Fantasy Football Rivals (“Rivals,” “we”) collects and uses
        information when you use the Rivals website and the Fantasy Football Rivals ESPN Connector
        Chrome extension.
      </p>

      <h2 className="text-lg font-bold text-white">ESPN Connector — what is accessed</h2>
      <p>
        The ESPN Connector has one purpose: connect an ESPN Fantasy Football league you already
        play to your Rivals account. When you ask it to connect, it reads ESPN authentication
        cookies already stored in your browser for ESPN sites: <strong>SWID</strong> and{" "}
        <strong>espn_s2</strong>. It also reads league information needed for that connection,
        including <strong>league ID</strong> and, when available, <strong>league name</strong>.
      </p>
      <p>
        To attach the connection to the correct Rivals account, the extension also reads Rivals
        session cookies for fantasyfootballrivals.com so the save request is made as the signed-in
        user.
      </p>

      <h2 className="text-lg font-bold text-white">ESPN Connector — why, where, and how</h2>
      <p>
        ESPN requires those cookies to identify your fantasy account and list leagues you can
        access. Rivals uses them to connect the league you choose and then to sync that league’s
        data into your Rivals account.
      </p>
      <p>
        Connection information is sent to Fantasy Football Rivals at fantasyfootballrivals.com
        (including www.fantasyfootballrivals.com) over HTTPS, to the existing league-connection
        API used by the product. It is not sent to 365globalsolutions.com, gmwarroom.online, or a
        Chrome Web Store listing, and it is not posted to an origin the extension does not
        recognize as Rivals.
      </p>
      <p>
        Rivals stores the connection against your signed-in account so you can use ESPN-backed
        features (league history, standings, draft and rivalry intelligence, and related product
        surfaces). ESPN cookies are used as credentials to ESPN’s fantasy APIs for that purpose.
        Credentials are encrypted at rest in the application database. The extension only completes
        a save after the Rivals page origin is recognized.
      </p>

      <h2 className="text-lg font-bold text-white">Rivals website accounts</h2>
      <p>
        The website uses a sign-in provider (Clerk) for account authentication, including Google
        sign-in when you choose it. Account email and profile fields are those you provide at
        sign-in. Connected-league records are stored in the Rivals application database.
      </p>
      <p>
        If you connect Sleeper (or another supported provider later), Rivals stores the league
        identifiers and credentials that provider flow requires, using the same connection record
        pattern. Those flows do not use the ESPN Connector.
      </p>

      <h2 className="text-lg font-bold text-white">Cookies and session</h2>
      <p>
        The ESPN Connector reads ESPN and Rivals cookies as described above. The website also uses
        session cookies and similar storage from Clerk so you stay signed in. We do not claim that
        Rivals never accesses cookies.
      </p>

      <h2 className="text-lg font-bold text-white">How information is used</h2>
      <p>
        We use account, league, and connection information to operate Fantasy Football Rivals:
        sign-in, league sync, standings and history, rivalries, draft tools, and related product
        surfaces you request.
      </p>

      <h2 className="text-lg font-bold text-white">AI processing</h2>
      <p>
        Some Rivals features (for example GM Advisor, RFSN commentary, and optional Post-Draft
        Evaluation narrative) send league-derived facts to an AI language-model provider so the
        product can generate interpretation. Those features run only when you use them. Written
        product data remains available when AI is off or unavailable. We do not use the ESPN
        Connector as an advertising or AI-training product of its own.
      </p>

      <h2 className="text-lg font-bold text-white">Sharing and processors</h2>
      <p>
        We do not sell your ESPN session cookies. We do not use the Connector as an advertising
        tracker. Service providers that host Rivals, authenticate accounts (Clerk), process
        payments (Stripe, when you subscribe), and generate optional AI text process data only to
        run the product. ESPN remains a separate service you already use; this policy does not
        replace ESPN’s privacy policy.
      </p>

      <h2 className="text-lg font-bold text-white">Retention</h2>
      <p>
        ESPN cookies remain in your browser under ESPN’s control until they expire or you sign out
        of ESPN. On Rivals, connection credentials are stored encrypted with the league connection
        while that league stays connected to your account. We do not publish a fixed calendar
        deletion period in this policy. If you disconnect the league in Settings, that connection
        is removed from your account. Residual backups or logs, if any, follow our hosting
        provider’s ordinary operations; we do not claim a specific number of days here.
      </p>

      <h2 className="text-lg font-bold text-white">Security</h2>
      <p>
        Connection credentials are encrypted at rest. Transport to Rivals uses HTTPS. Origin checks
        on the Connector prevent a page we did not ship from reading your ESPN session through this
        extension.
      </p>

      <h2 className="text-lg font-bold text-white">Your controls</h2>
      <p>
        You can decline to install the extension, decline to connect a league, sign out of ESPN in
        the browser, or disconnect a league from{" "}
        <Link to="/settings" className="text-lime-400 hover:text-lime-300">
          Settings
        </Link>{" "}
        after signing in. Uninstalling the extension stops further Connector access from that
        browser.
      </p>

      <h2 className="text-lg font-bold text-white">Children</h2>
      <p>
        Fantasy Football Rivals is not directed at children under 13. We do not knowingly collect
        personal information from children under 13.
      </p>

      <h2 className="text-lg font-bold text-white">Contact</h2>
      <p>
        Product, connection, and privacy questions: see{" "}
        <Link to="/support" className="text-lime-400 hover:text-lime-300">
          Support
        </Link>
        . We do not publish a separate support inbox.
      </p>

      <h2 className="text-lg font-bold text-white">Updates</h2>
      <p>
        We may update this policy when the Connector or website changes. The date at the top of
        this page is the current version.
      </p>
    </LegalPublicLayout>
  );
}
