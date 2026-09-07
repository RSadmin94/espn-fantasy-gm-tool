# Reviewer instructions — Fantasy Football Rivals ESPN Connector v1.14.4

Google does not need founder ESPN credentials if the reviewer has their own ESPN Fantasy Football account and can create a Fantasy Football Rivals account.

Do not include real founder passwords in the dashboard.

---

## Test instructions (paste into the Test instructions tab)

```
Product: Fantasy Football Rivals — ESPN Connector (v1.14.4)
Purpose: Connect an ESPN Fantasy Football league to a Fantasy Football Rivals account.

1. Install this extension from the uploaded ZIP.
2. Open https://www.fantasyfootballrivals.com in Chrome (desktop).
3. Create or sign in to a Fantasy Football Rivals account (Google account picker is offered).
4. Go to Where do you play? and choose ESPN.
5. If the site asks you to install the connector, it is already installed — continue.
6. If you are not signed in to ESPN in Chrome, sign in at ESPN using ESPN’s normal sign-in page, then return to Rivals.
7. Return to Rivals. The site should detect the installed connector (the page sets a presence flag; the toolbar popup also shows ESPN session status).
8. The connector reads the ESPN session cookies required to list leagues (SWID and espn_s2). Cookie values are not shown in the popup.
9. Accessible ESPN Fantasy Football leagues are discovered.
10. If the ESPN account has one league, Rivals connects that league.
11. If the ESPN account has multiple leagues, Rivals shows a chooser (“Which leagues are yours?”). Select one or more and connect.
12. The selected league is saved to the signed-in Rivals account over HTTPS.
13. Team selection appears only if Rivals cannot resolve which team you own.
14. After a successful connection, the user reaches the Rivals dashboard.

Expected signed-out ESPN behavior:
If ESPN cookies are missing, the popup says ESPN is not signed in and offers “Sign in to ESPN.” The website also asks the user to sign in to ESPN. That is success, not a crash.

Do not test against localhost, gmwarroom.online, or Preview hosts. This build only completes a save to https://www.fantasyfootballrivals.com or https://fantasyfootballrivals.com.

This extension is not a FantasyPros tool, not a live-draft overlay, and not an admin console. League save happens on the Rivals website.
```

---

## Credentials

| Account | Required? | This package |
|---|---|---|
| Rivals | Reviewer can create one at the homepage | No shared account included |
| ESPN Fantasy | Reviewer should use their own ESPN account that has at least one football league | No shared account included |
| Test league | Any league the reviewer’s ESPN account can access | Do not use founder private leagues |

### FOUNDER ACTION REQUIRED — REVIEW TEST CREDENTIALS

If Google’s dashboard **requires** username/password fields and will not save without them, founder must create **throwaway** Rivals + ESPN accounts for review and paste those only into the dashboard Test instructions box.

Do **not** create those accounts in this ticket. Do **not** put founder production credentials in the Store dashboard.

Until Google demands shared credentials, reviewer-owned accounts are sufficient.

---

## Notes if the reviewer inspects source

The service worker still contains unused internal message handlers (historical import, FantasyPros, Live Draft). They are not declared in the Store manifest and are not offered in the Store popup. The Store-facing purpose and declared permissions are ESPN → Rivals connect only.
