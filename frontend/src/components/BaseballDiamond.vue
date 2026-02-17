<template>
  <!--
    BaseballDiamond — an SVG visualization of a baseball infield diamond.

    Shows the four bases (home, 1st, 2nd, 3rd), base paths, pitcher's mound,
    and runner indicators. Bases light up yellow and show red runner dots
    when occupied, giving an at-a-glance view of the baserunner situation.

    This is a purely presentational component — it receives the `bases` array
    as a prop and renders accordingly. No interactivity or state management.
  -->
  <div class="diamond-container">
    <!--
      SVG COORDINATE SYSTEM:
      The viewBox is 200x200 units. The diamond is rotated 45 degrees so that
      home plate is at the bottom, 2nd base at the top, 1st base at the right,
      and 3rd base at the left — matching how a baseball field looks from above.

      Key coordinates:
        - Home plate: (100, 174) — bottom center
        - 1st base:   (170, 100) — right middle
        - 2nd base:   (100, 30)  — top center
        - 3rd base:   (30, 100)  — left middle
        - Pitcher:    (100, 100) — dead center

      These form a perfect diamond (square rotated 45 degrees) with 70-unit sides.
    -->
    <svg viewBox="0 0 200 200" class="diamond-svg">
      <!-- Grass background — green rectangle with rounded corners fills the entire SVG -->
      <rect x="0" y="0" width="200" height="200" fill="#3a8f35" rx="8" />

      <!--
        Infield dirt diamond — the brown diamond shape representing the dirt infield.
        This polygon connects all four base positions to create the diamond shape.
        The slightly darker stroke gives it a subtle 3D edge effect.
      -->
      <polygon points="100,30 170,100 100,170 30,100" fill="#c4956a" stroke="#8b6914" stroke-width="1" />

      <!--
        Base paths — white lines connecting each base.
        These four lines trace the path runners follow around the bases.
        Each line connects two adjacent bases to form the diamond outline.
      -->
      <line x1="100" y1="30" x2="170" y2="100" stroke="white" stroke-width="1.5" />
      <line x1="170" y1="100" x2="100" y2="170" stroke="white" stroke-width="1.5" />
      <line x1="100" y1="170" x2="30" y2="100" stroke="white" stroke-width="1.5" />
      <line x1="30" y1="100" x2="100" y2="30" stroke="white" stroke-width="1.5" />

      <!--
        Home plate — the pentagon shape at the bottom of the diamond.
        In real baseball, home plate is a 5-sided polygon. Here we approximate
        it with a small diamond shape for visual clarity at this scale.
      -->
      <polygon points="100,167 106,173 106,180 94,180 94,173" fill="white" stroke="#ccc" stroke-width="0.5" />

      <!--
        Pitcher's mound — a circle with a small white rectangle (the rubber).
        The circle represents the raised dirt mound, and the white rectangle
        is the pitcher's rubber that the pitcher must touch during delivery.
      -->
      <circle cx="100" cy="100" r="5" fill="#c4956a" stroke="#8b6914" stroke-width="1" />
      <rect x="97" y="98" width="6" height="1.5" fill="white" />

      <!-- 1ST BASE: show base square when empty, runner figure when occupied -->
      <rect
        v-if="!bases[0]"
        x="165" y="95" width="10" height="10"
        fill="white" stroke="#ccc" stroke-width="1.5"
        transform="rotate(45, 170, 100)"
      />
      <g v-else :transform="`translate(${leadoffs[0] ? 162 : 170}, ${leadoffs[0] ? 89 : 97})`">
        <circle cx="0" cy="-11" r="3" fill="#111" />
        <line x1="0" y1="-8" x2="0" y2="-1" stroke="#111" stroke-width="1.5" stroke-linecap="round" />
        <line x1="-4" y1="-7" x2="4" y2="-4" stroke="#111" stroke-width="1.2" stroke-linecap="round" />
        <line x1="0" y1="-1" x2="4" y2="5" stroke="#111" stroke-width="1.3" stroke-linecap="round" />
        <line x1="0" y1="-1" x2="-4" y2="4" stroke="#111" stroke-width="1.3" stroke-linecap="round" />
      </g>

      <!-- 2ND BASE: show base square when empty, runner figure when occupied -->
      <rect
        v-if="!bases[1]"
        x="95" y="25" width="10" height="10"
        fill="white" stroke="#ccc" stroke-width="1.5"
        transform="rotate(45, 100, 30)"
      />
      <g v-else :transform="`translate(${leadoffs[1] ? 91 : 100}, ${leadoffs[1] ? 36 : 27})`">
        <circle cx="0" cy="-11" r="3" fill="#111" />
        <line x1="0" y1="-8" x2="0" y2="-1" stroke="#111" stroke-width="1.5" stroke-linecap="round" />
        <line x1="-4" y1="-7" x2="4" y2="-4" stroke="#111" stroke-width="1.2" stroke-linecap="round" />
        <line x1="0" y1="-1" x2="4" y2="5" stroke="#111" stroke-width="1.3" stroke-linecap="round" />
        <line x1="0" y1="-1" x2="-4" y2="4" stroke="#111" stroke-width="1.3" stroke-linecap="round" />
      </g>

      <!-- 3RD BASE: show base square when empty, runner figure when occupied -->
      <rect
        v-if="!bases[2]"
        x="25" y="95" width="10" height="10"
        fill="white" stroke="#ccc" stroke-width="1.5"
        transform="rotate(45, 30, 100)"
      />
      <g v-else :transform="`translate(${leadoffs[2] ? 39 : 30}, ${leadoffs[2] ? 107 : 97})`">
        <circle cx="0" cy="-11" r="3" fill="#111" />
        <line x1="0" y1="-8" x2="0" y2="-1" stroke="#111" stroke-width="1.5" stroke-linecap="round" />
        <line x1="-4" y1="-7" x2="4" y2="-4" stroke="#111" stroke-width="1.2" stroke-linecap="round" />
        <line x1="0" y1="-1" x2="4" y2="5" stroke="#111" stroke-width="1.3" stroke-linecap="round" />
        <line x1="0" y1="-1" x2="-4" y2="4" stroke="#111" stroke-width="1.3" stroke-linecap="round" />
      </g>

      <!--
        Base labels — "1B", "2B", "3B" text positioned outside each base.
        These help viewers who may not be familiar with the diamond layout
        identify which base is which. Small font size keeps them unobtrusive.
      -->
      <text x="182" y="104" font-size="8" fill="white" font-weight="bold">1B</text>
      <text x="100" y="17" font-size="8" fill="white" font-weight="bold" text-anchor="middle">2B</text>
      <text x="8" y="104" font-size="8" fill="white" font-weight="bold">3B</text>
    </svg>
  </div>
</template>

<script setup>
/**
 * Component props.
 *
 * bases: A 3-element boolean array representing base occupancy:
 *   - bases[0] = 1st base (true if a runner is on 1st)
 *   - bases[1] = 2nd base (true if a runner is on 2nd)
 *   - bases[2] = 3rd base (true if a runner is on 3rd)
 *
 * Home plate is not included because it's not "occupied" — a runner
 * crossing home plate scores a run and is removed from the bases.
 *
 * Default is [false, false, false] (bases empty).
 */
defineProps({
  bases: {
    type: Array,
    default: () => [false, false, false],
  },
  leadoffs: {
    type: Array,
    default: () => [false, false, false],
  },
})
</script>

<style scoped>
/* Centers the SVG diamond horizontally within its parent container */
.diamond-container {
  display: flex;
  justify-content: center;
}

/*
  Fixed size for the diamond SVG.
  220x220px is large enough to see base details clearly but small enough
  to sit alongside the pitcher/batter headshot cards in the field layout.
  The viewBox (200x200) scales to fit this pixel size automatically.
*/
.diamond-svg {
  width: 220px;
  height: 220px;
}

@media (max-width: 600px) {
  .diamond-svg {
    width: 160px;
    height: 160px;
  }
}
</style>
