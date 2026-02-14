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
      <rect x="0" y="0" width="200" height="200" fill="#2d5a27" rx="8" />

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
      <polygon points="100,168 94,174 100,180 106,174" fill="white" />

      <!--
        Pitcher's mound — a circle with a small white rectangle (the rubber).
        The circle represents the raised dirt mound, and the white rectangle
        is the pitcher's rubber that the pitcher must touch during delivery.
      -->
      <circle cx="100" cy="100" r="5" fill="#c4956a" stroke="#8b6914" stroke-width="1" />
      <rect x="97" y="98" width="6" height="1.5" fill="white" />

      <!--
        1ST BASE — a small square rotated 45 degrees to appear as a diamond.

        Dynamic styling via Vue bindings:
        - fill: Yellow (#ffdd00) when occupied (runner on base), white when empty
        - stroke: Orange when occupied (matches the yellow), gray when empty

        The transform="rotate(45, 170, 100)" rotates the square around the
        base's center point to create the traditional diamond-shaped base icon.

        bases[0] = 1st base occupancy (true/false)
      -->
      <rect
        :x="165" :y="95" width="10" height="10"
        :fill="bases[0] ? '#ffdd00' : 'white'"
        :stroke="bases[0] ? '#ff8800' : '#ccc'"
        stroke-width="1.5"
        transform="rotate(45, 170, 100)"
      />

      <!--
        2ND BASE — same pattern as 1st base but positioned at the top of the diamond.
        bases[1] = 2nd base occupancy (true/false)
      -->
      <rect
        :x="95" :y="25" width="10" height="10"
        :fill="bases[1] ? '#ffdd00' : 'white'"
        :stroke="bases[1] ? '#ff8800' : '#ccc'"
        stroke-width="1.5"
        transform="rotate(45, 100, 30)"
      />

      <!--
        3RD BASE — same pattern but positioned at the left of the diamond.
        bases[2] = 3rd base occupancy (true/false)
      -->
      <rect
        :x="25" :y="95" width="10" height="10"
        :fill="bases[2] ? '#ffdd00' : 'white'"
        :stroke="bases[2] ? '#ff8800' : '#ccc'"
        stroke-width="1.5"
        transform="rotate(45, 30, 100)"
      />

      <!--
        Runner dots — red circles shown on top of occupied bases.
        These are conditionally rendered (v-if) and placed at each base's
        center coordinates. The bright red color makes runners instantly
        visible against the yellow base and brown dirt background.

        The dots are rendered AFTER the base squares in the SVG so they
        appear on top (SVG uses painter's model — later elements paint over earlier ones).
      -->
      <circle v-if="bases[0]" cx="170" cy="100" r="7" fill="#ff4444" stroke="#cc0000" stroke-width="1" />
      <circle v-if="bases[1]" cx="100" cy="30" r="7" fill="#ff4444" stroke="#cc0000" stroke-width="1" />
      <circle v-if="bases[2]" cx="30" cy="100" r="7" fill="#ff4444" stroke="#cc0000" stroke-width="1" />

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
</style>
