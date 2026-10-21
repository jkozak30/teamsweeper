# 6.1040 Personal Project: Teamsweeper

This repository contains Julia's personal project code and design for 6.1040.

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
  - [I. Demo Video](https://youtu.be/6Yp2CGgSmSA)
  - [II. Design Document](design/p4-design.md)

## Instructions for Running Tests

0. The prerequisite software for running tests is Bun and Podman + Compose, with installation as specified [here](https://61040.github.io/fa26/resources/mongodb-setup/) (steps 1 & 3).
1. Within a cloned copy of this repo, create `app/.env` with the same contents as `app/.env.example`: 
```
cp app/.env.example app/.env
```
2. Install dependencies and start the DB instance:
```
cd app
bun install
bun run db:up
```
3. Once those succeed, run the testbench (from `app/`):
```
bun run test
```

A saved passing test run is available [here](design/refs/p3-tests.txt).

