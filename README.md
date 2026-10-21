# 6.1040 Personal Project: Teamsweeper

**Teamsweeper** is a web-based multiplayer game that allows private groups to solve one Minesweeper board together, using shared flags and highlights to communicate.

## Links to Project-related files

- [P1: Design](design/p1.md)
  - [I. Problem framing and stakeholders](design/p1.md#problem-framing)
  - [II. Application pitch](design/p1.md#application-pitch)
  - [III. Concept design](design/p1.md#concept-design)
  - [IV. UI sketches](design/p1.md#ui-sketches)
  - [V. User journey](design/p1.md#user-journey)
- [P2: Alpha](design/p2.md)
  - [I. Core User Journey](design/p2.md#core-user-journey)
  - [II. Screen Recording](https://www.youtube.com/watch?v=moLanjo8Bjk)
- [P3: Beta](design/p3.md)
  - [I. Deployed App](https://teamsweeper.mit-sdg.dev/)
  - [II. Automated Testing](design/p3.md#automated-testing)
  - [III. Visual Design Study](design/p3.md#visual-design-study)
  - [IV. Core User Journey](design/p3.md#updated-core-user-journey)
  - [V. Screen Recording](https://youtu.be/Ga1wg9GUeek)
- [P4: Code Complete](design/p4.md)
  - [I. Deployed App](https://teamsweeper.mit-sdg.dev/)
  - [II. Demo Video](https://youtu.be/6Yp2CGgSmSA)
  - [III. Design Document](design/p4-design.md)

### Key Links
- **Documentation:** [concepts](./app/design/concepts/) and [compositions](./app/design/compositions/).
- **Demos:** [Alpha](https://www.youtube.com/watch?v=moLanjo8Bjk), [Beta](https://youtu.be/Ga1wg9GUeek), or [Final](https://youtu.be/6Yp2CGgSmSA).
- **Visual Design Study:** [here](https://docs.google.com/presentation/d/12Dv1MVFWIcl5h8x9Pc4ztNnX8XX8Qj4gwKlgfCffN-4/edit?usp=sharing).
- **Design Document:** [here](design/p4-design.md).

## General Setup Instructions

0. The prerequisite software for running tests is Bun and Podman + Compose, with installation as specified [here](https://61040.github.io/fa26/resources/mongodb-setup/) (steps 1 & 3).
1. Within a cloned copy of this repo, create `app/.env` with the same contents as `app/.env.example`: 
```
cp app/.env.example app/.env
```
2. Install dependencies:
```
cd app
bun install
```

## Instructions for Building + Running App Locally

0. Follow the setup steps outlined in [General Setup Instructions](#general-setup-instructions).
1. To start the database, backend, and frontend **in development mode**, run from `app/`:
```
bun run dev
```
Then navigate to http://127.0.0.1:8080. 

This will run the app with automatic reloading, with the backend running on http://127.0.0.1:3000 and the frontend on http://127.0.0.1:8080.

2. Alternatively, to build and run the **production version** locally, run from `app/`:
```
bun run preview
```
This starts the database, builds the frontend, and serves the app at http://127.0.0.1:3000. 

*Note:* make sure to stop the development mode when running the production version (and vice versa), as they listen on shared ports.

3. To only build the frontend, run from `app/`:
```
bun run build
```

4. To stop the app, press Ctrl+C. To also stop the database, run from `app/`:
```
bun run down
```

## Instructions for Running Tests

0. Follow the setup steps outlined in [General Setup Instructions](#general-setup-instructions).
1. Start the DB instance (from `app/`):
```
bun run db:up
```
2. Once that succeeds, run the testbench (from `app/`):
```
bun run test
```

A saved passing test run is available [here](design/refs/p4-tests.txt).

3. When finished, you can stop the database (from `app/`):
```
bun run down
```