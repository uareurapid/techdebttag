When developers write code, they often leave "reminders" for themselves or their teammates. In software engineering, these code comments are formally known as **Self-Admitted Technical Debt (SATD)**.

By using specific standardized tags, modern IDEs (like VS Code or IntelliJ), linters, and CI/CD pipelines can scan the codebase, highlight them in bright colors, and even compile them into task lists.

Here are the main tags developers use, categorized by their purpose and urgency:

---

### The Standard Comment Tags

| Tag | Purpose | Urgency / Sentiment | Example |
| --- | --- | --- | --- |
| **`TODO`** | Reminders for planned features, incomplete tasks, or minor cleanups. | **Low to Medium** — "I'll get to this when I can." | `// TODO: Refactor this loop to support multi-threading.` |
| **`FIXME`** | Highlights broken, buggy, or temporary code that needs correction. | **High** — "This works for now, but it's fragile/broken." | `// FIXME: Handle null values here to prevent a crash.` |
| **`HACK`** | Explicitly marks a quick-and-dirty workaround or "smelly" code. | **Medium** — "I'm not proud of this, but it works." | `// HACK: Hardcoded port because the config file parser is failing.` |
| **`XXX`** | Warns of tricky, dangerous, or highly suboptimal logic that needs critical review. | **High** — "Danger zone, pay close attention here." | `// XXX: This bypasses authentication for testing. MUST be removed.` |
| **`BUG`** | Points directly to a known, active bug in the code. | **High** — Usually linked to an active ticket. | `// BUG: Off-by-one error occurs on leap years. See ticket #402.` |
| **`OPTIMIZE`** / **`PERF`** | Identifies sluggish code, bottlenecks, or areas where memory usage can be improved. | **Low to Medium** — "Works fine, but could run faster." | `// OPTIMIZE: Use a hashmap here instead of nested O(N²) loops.` |
| **`DEPRECATED`** | Warns developers that a function or class is scheduled for removal. | **Medium** — Crucial for library and API maintenance. | `// DEPRECATED: Use the new v2/fetchData endpoint instead.` |
| **`NOTE`** / **`INFO`** | Provides essential context or explains *why* a confusing design choice was made. | **Informational** — Explains the "why," preventing accidental breakage. | `// NOTE: This API requires payload keys to be in alphabetical order.` |

---

### Best Practices for Managing Comment Debt

While these tags are highly effective for "in-the-moment" coding, they can quickly turn into a "TODO graveyard" if left unmanaged. Healthy engineering teams usually adopt a few ground rules:

* **Link to Tickets:** A raw `TODO` is easily ignored. Appending a Jira, GitHub, or internal tracking ticket number makes it searchable and actionable.
> `// TODO(JIRA-401): Implement proper OAuth2 handshakes.`


* **Assign Ownership:** Adding a name or GitHub username ensures the context isn't lost when someone else takes over the file.
> `// FIXME(@johndoe): This regex is too greedy.`


* **Enforce Expirations:** Some teams use linting tools (like ESLint rules in JavaScript/TypeScript) to throw errors or warnings if a `TODO` comment is older than a certain date or lacks a ticket reference.