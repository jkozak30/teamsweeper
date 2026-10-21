# Teamsweeper: Final Design

**Teamsweeper** is a web-based multiplayer game that allows private groups to solve one Minesweeper board together, using shared flags and highlights to communicate. The final app retains the four responsibilities of my [P1 design](https://github.com/jkozak30/teamsweeper/blob/b572b857e8f6b1ecd5b8f82b1ba4f17fe55bfd46/design/p1.md): gameplay, room membership, annotation, and performance ranking. The largest changes were making participant identity explicit and keeping multiplayer interactions responsive.

## Concept changes from P1

### Key Changes

My final design has five core concepts: four retained from P1, and added **Sessioning**. The following table summarizes the key changes and design decisions that went into each concept:

| Concept | Significant changes | Rationale |
| --- | --- | --- |
| **Sessioning** | **Concept added during P2.** Separate concept for participant identity, with renewable sessions and presence tracking. Cookie transport is handled in the HTTP adapter. | P1 assumed requests could identify participants without specifying how. Separating identity from membership supports session restoration without coupling rooming to a particular authentication mechanism. Additionally, presence tracking allows another player to take over when the host disconnects. |
| **RoomJoining** | **Added self-service host transfer, and input limits.** The host has the option to reassign another player to be host, and user names are limited to 1-32 characters. | Players should be able to choose who controls subsequent rounds, as otherwise automatic reassignment could pick an unwanted host. Backend name validation also protects against storing arbitrary user input, and prevents direct requests from bypassing the frontend’s limits. |
| **MinesweeperPlaying** | **Added per-cell updates/queries, input limits, and metric bug fixes.** Queries return only the cells that have changed since the client's last update, rather than the whole board. Board dimensions are limited to 100 x 100. Games completed in zero time have speed set to 0. | Full-board polling became slow on large boards: incremental updates reduce message size, improving responsiveness. Board limits additionally prevent frequent large messages sent to/from the client during gameplay. Zero-time handling allows first-click wins to be recorded, without failing at division by zero. |
| **Annotating** | **Added smaller updates and batch highlighting.** Each target identifies its game and cell. Polling only returns a player’s highlights when they change, and `highlight` accepts multiple items in one request. | Avoids repeatedly sending unchanged highlights and sending a separate request for every cell in a drag. Game-specific cell identities are supplied by the composition, so Annotating remains independent of game rules. |
| **PerformanceRanking** | **Added pagination and expanded filtering.** Results can be retrieved in pages and filtered by board settings and outcome, including both wins and losses. | Players should have the option to compare attempts with matching settings, review losses alongside wins. Pagination lets them browse results without loading a large volume of recorded games at once. |

### Further Redesigns

The details of the new Sessioning concept evolved throughout iteration, landing on the [revised session design](https://github.com/jkozak30/teamsweeper/blob/e7a38d843b654b381ff8c1cd4708db1eb5aecd25/app/design/concepts/Sessioning.md). This incorporates automatic session renewal for active users, as well as session timeouts for inactive users e.g. if they close the tab (10 seconds for hosts, and 10 minutes for non-hosts). The rationale for this was to prevent user sessions from unwantedly timing out, while allowing for more intuitive room exiting: a user can now close the tab to exit the room, and the timeout threshold will offer a grace period in the case they accidentally close out.

## Reaction design

The following list summarizes the key reaction principles and additions from P1:

- **Identify the requester through Sessioning.** P1’s request reactions accepted a participant identifier without explaining how it was trusted. The final endpoints obtain that identity from the session cookie before checking room membership and host authority. A requester cannot act as another participant by supplying their identifier.

- **Handle an absent host.** P1 reassigned hosting when a participant explicitly left, creating a bad situation if a host closes the tab assuming it causes them to exit the room. The final design also detects host absence through session presence checks (sending "heartbeats" to the server), and triggers the existing room-leaving behavior. This allows another active player to become host without an explicit leave request.

- **Combine moves and annotation clearing.** In P4, I moved the frontend’s separate annotation-clear request into the gameplay composition. A successful move now clears the acting player’s highlights within the same request, saving one network round trip. Additionally, refused moves preserve highlights, and gameplay/annotation concepts remain independent (this only needs to be wired through reactions).

## Frontend and visual design

The sidebar/main-board layout and familiar Minesweeper appearance from P1 remain. 

One key aspect of my P2 work was implementing the algorithm to assign players distinct, deterministic, and stateless annotation colors, which was a core feature I preserved into my final app. Colors are randomly selected, with randomness seeded based on the room and participant list identifiers. This allows visually distinct colors to be selected deterministically and consistently across all clients without needing to be stored in the backend. Additionally, color selection based on room ID adds some visual randomness with assigned colors (more fun for repeat users!).

My [P3 visual study](https://github.com/jkozak30/teamsweeper/blob/4fc7df504a07a5924f3ed3e7d5b153c5148ccb0e/design/p3.md#visual-design-study) established the navy palette, typography, and raised/recessed surfaces. During P3, I simplified ranking controls into one metric selector and icon toggles, distinguished outcomes through icons and color, and emphasized the current result using color.

To improve the user experience, I also considered and added the following improvements during P3:
- **Mouse-free controls.** Shift-click and H-click provide trackpad alternatives to right/middle clicking.
- **Smoother data population.** I removed loading elements for quick request/response actions to reduce visual chaos when interacting with the board. Additionally, polling requests automatically update without any visual indication of loading or waiting on response.
- **Responsiveness.** Allowing rendering to occur per-cell in the frontend (adjacent to incremental updates received from the backend) reduced the amount of lag and unnecessary work occurring when re-rendering large boards.
- **Error tolerance.** Host transfer requires confirmation to select another player, which prevents against accidental reassignment. 

P4 preserves this visual design, and the main feature I emphasized was improving **discoverability**: filter tooltips explain the role of a button on hover, and the "how to play" menu explains full steps to start and restart games.

## Validation

Concept and integration tests exercise game rules, refusals, room isolation, host authority, session expiry, synchronization, and result recording: tests establish state through concept actions and check invariants. The following table groups the deployed checks I established during my P3 deployment; all listed checks matched the expected behavior on the final P4 deployment.

| Check | Expected behavior |
| --- | --- |
| **Shared play** | Creating and joining produces matching room details. Reveals, flags, chords, and single/drag highlights synchronize across clients. A successful move clears only the acting player’s highlights. |
| **Results and rankings** | Wins and losses are recorded once, including zero-time wins. Outcome/settings filters and metric sorting produce the expected results, with working pagination. |
| **Sessions and room lifecycle** | Reloading restores room membership and the current board/results. Active sessions renew; explicit departure and host absence update membership and hosting. The last departure closes the room. |
| **Invalid and unauthorized requests** | Invalid names, codes, settings, and coordinates are refused. Non-host and cross-room requests cannot perform restricted actions. Refused moves and invalid highlight selections preserve the relevant state. |

## Remaining tradeoffs

Polling still creates frequent database reads, and multi-write operations can leave partial state after a storage failure. I retained these limitations for the current small-group scope rather than expanding P4 into a storage or communication redesign. Highlight colors also remain stateless and deterministic for the current membership, accepting that they can change when players join or leave.