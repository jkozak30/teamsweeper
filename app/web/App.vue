<script setup lang="ts">
import { ref } from "vue";

const clicks = ref(0);
</script>

<template>
  <main>
    <h1>Teamsweeper</h1>
    <p>Vue is running.</p>
    <button @click="clicks++">Clicked {{ clicks }} times</button>
  </main>
</template>