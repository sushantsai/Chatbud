// What people come to Chatbud for, in their own words. Each need belongs to one
// area of care and brings together small goals, the right professionals and
// helpful products.
import type { Feature } from "./features";
export type Area = "mental" | "nutrition" | "fitness";
export type GoalTemplate = {
  code: string;
  title: string;
  // One small thing to do on the day.
  action: string;
  // Days a week that count as on track.
  weeklyTarget: number;
};
export type Need = {
  slug: string;
  area: Area;
  title: string;
  summary: string;
  professions: string[];
  productCategories: string[];
  goals: GoalTemplate[];
};
export const areas: {
  id: Area & Feature;
  name: string;
  line: string;
}[] = [
  { id: "mental", name: "Mind", line: "Feel steadier, sleep and focus." },
  { id: "nutrition", name: "Nourish", line: "Food that fits your body." },
  { id: "fitness", name: "Move", line: "Strength, energy and ease." },
];
const mind = ["clinical_psychologist", "psychiatrist", "counselor"];
const food = ["dietitian", "nutritionist"];
export const needs: Need[] = [
  {
    slug: "feel-calmer",
    area: "mental",
    title: "Feel calmer",
    summary: "For stress, worry and a mind that will not slow down.",
    professions: mind,
    productCategories: ["MENTAL_WELLNESS", "WELLNESS"],
    goals: [
      {
        code: "breathe-5",
        title: "Five slow minutes",
        action: "Breathe slowly for 5 minutes",
        weeklyTarget: 7,
      },
      {
        code: "worry-note",
        title: "Worry, then next step",
        action: "Write one worry and one next step",
        weeklyTarget: 5,
      },
      {
        code: "walk-outside",
        title: "Ten minutes outside",
        action: "Take a 10-minute walk outside",
        weeklyTarget: 5,
      },
    ],
  },
  {
    slug: "lift-your-mood",
    area: "mental",
    title: "Lift a low mood",
    summary: "For days that feel heavy, flat or lonely.",
    professions: mind,
    productCategories: ["MENTAL_WELLNESS"],
    goals: [
      {
        code: "one-good-thing",
        title: "One good thing",
        action: "Note one good thing from today",
        weeklyTarget: 7,
      },
      {
        code: "reach-out",
        title: "Reach out",
        action: "Call or message someone you trust",
        weeklyTarget: 3,
      },
      {
        code: "morning-light",
        title: "Morning light",
        action: "Spend 15 minutes in morning daylight",
        weeklyTarget: 5,
      },
    ],
  },
  {
    slug: "sleep-better",
    area: "mental",
    title: "Sleep better",
    summary: "For trouble falling asleep or waking up tired.",
    professions: mind,
    productCategories: ["MENTAL_WELLNESS", "WELLNESS"],
    goals: [
      {
        code: "screens-off",
        title: "Screens off before bed",
        action: "Put screens away 30 minutes before bed",
        weeklyTarget: 7,
      },
      {
        code: "same-bedtime",
        title: "Same bedtime",
        action: "Go to bed at your set time",
        weeklyTarget: 6,
      },
      {
        code: "no-late-tea",
        title: "No late tea or coffee",
        action: "No tea or coffee after 3 pm",
        weeklyTarget: 7,
      },
    ],
  },
  {
    slug: "focus-and-habits",
    area: "mental",
    title: "Focus and motivation",
    summary: "For endless scrolling, low drive and unfinished plans.",
    professions: ["clinical_psychologist", "counselor"],
    productCategories: ["MENTAL_WELLNESS"],
    goals: [
      {
        code: "phone-free-hour",
        title: "One phone-free hour",
        action: "Keep one hour phone-free",
        weeklyTarget: 5,
      },
      {
        code: "one-thing-first",
        title: "One thing first",
        action: "Finish one important thing before opening social apps",
        weeklyTarget: 5,
      },
      {
        code: "social-under-hour",
        title: "Social apps under an hour",
        action: "Keep social apps under 1 hour",
        weeklyTarget: 5,
      },
    ],
  },
  {
    slug: "eat-for-a-condition",
    area: "nutrition",
    title: "Eat for a health condition",
    summary: "For diabetes, blood pressure, thyroid, PCOS and more.",
    professions: ["dietitian"],
    productCategories: ["NUTRITION", "DEVICES"],
    goals: [
      {
        code: "half-plate-veg",
        title: "Half a plate of vegetables",
        action: "Fill half your plate with vegetables at one meal",
        weeklyTarget: 7,
      },
      {
        code: "water-not-sweet",
        title: "Water, not sweet drinks",
        action: "Choose water instead of a sweet drink",
        weeklyTarget: 7,
      },
      {
        code: "regular-meals",
        title: "Three regular meals",
        action: "Eat three meals at regular times",
        weeklyTarget: 6,
      },
    ],
  },
  {
    slug: "healthy-weight",
    area: "nutrition",
    title: "Reach a healthy weight",
    summary: "Steady change with a plan made for you, not a crash diet.",
    professions: food,
    productCategories: ["NUTRITION", "FITNESS"],
    goals: [
      {
        code: "smaller-dinner",
        title: "A lighter dinner",
        action: "Serve a smaller portion at dinner",
        weeklyTarget: 6,
      },
      {
        code: "protein-each-meal",
        title: "Protein at each meal",
        action: "Include dal, eggs, curd or meat in each meal",
        weeklyTarget: 6,
      },
      {
        code: "weigh-weekly",
        title: "Weekly weigh-in",
        action: "Weigh yourself once this week",
        weeklyTarget: 1,
      },
    ],
  },
  {
    slug: "eat-better",
    area: "nutrition",
    title: "Eat better every day",
    summary: "Simple habits for more energy and fewer skipped meals.",
    professions: food,
    productCategories: ["NUTRITION", "WELLNESS"],
    goals: [
      {
        code: "breakfast",
        title: "Breakfast every day",
        action: "Eat breakfast",
        weeklyTarget: 7,
      },
      {
        code: "water-8",
        title: "Eight glasses of water",
        action: "Drink 8 glasses of water",
        weeklyTarget: 7,
      },
      {
        code: "one-fruit",
        title: "One fruit a day",
        action: "Eat one fruit",
        weeklyTarget: 7,
      },
    ],
  },
  {
    slug: "get-stronger",
    area: "fitness",
    title: "Get stronger",
    summary: "Build strength safely, at home or in the gym.",
    professions: ["personal_trainer", "fitness_coach"],
    productCategories: ["FITNESS", "NUTRITION"],
    goals: [
      {
        code: "strength-3",
        title: "Strength, three times a week",
        action: "Do a strength workout",
        weeklyTarget: 3,
      },
      {
        code: "ten-reps",
        title: "Ten a day",
        action: "Do 10 push-ups or squats",
        weeklyTarget: 5,
      },
    ],
  },
  {
    slug: "move-more",
    area: "fitness",
    title: "Move more",
    summary: "For long sitting days and getting your energy back.",
    professions: ["fitness_coach", "personal_trainer"],
    productCategories: ["FITNESS", "DEVICES"],
    goals: [
      {
        code: "walk-30",
        title: "Thirty-minute walk",
        action: "Walk for 30 minutes",
        weeklyTarget: 5,
      },
      {
        code: "take-stairs",
        title: "Take the stairs",
        action: "Take the stairs instead of the lift",
        weeklyTarget: 5,
      },
      {
        code: "stand-hourly",
        title: "Up every hour",
        action: "Stand up and move every hour at work",
        weeklyTarget: 5,
      },
    ],
  },
  {
    slug: "ease-and-flexibility",
    area: "fitness",
    title: "Ease aches, stay flexible",
    summary: "Yoga and stretching for a stiff back, neck or joints.",
    professions: ["yoga_instructor", "fitness_coach"],
    productCategories: ["FITNESS", "PERSONAL_CARE"],
    goals: [
      {
        code: "stretch-10",
        title: "Ten-minute stretch",
        action: "Stretch for 10 minutes",
        weeklyTarget: 5,
      },
      {
        code: "yoga-3",
        title: "Yoga, three times a week",
        action: "Do a yoga session",
        weeklyTarget: 3,
      },
    ],
  },
];
export const findNeed = (slug: string) => needs.find((n) => n.slug === slug);
export const areaName = (id: string) =>
  areas.find((a) => a.id === id)?.name || id;
// "Every day" reads better than "7 days a week".
export const rhythm = (weeklyTarget: number) =>
  weeklyTarget >= 7
    ? "Every day"
    : weeklyTarget === 1
      ? "Once a week"
      : `${weeklyTarget} days a week`;
