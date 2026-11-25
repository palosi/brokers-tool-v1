window.BT = window.BT || {};

// Everything a non-programmer may want to change between test rounds lives here.
BT.config = {
  // Sizes in board units. The aim sits at (0, 0).
  // The Aim circle shows the heading and the answer to the first aspiration question.
  // A larger outer circle (SURROUNDINGS_RADIUS) gives more room for cards, and makes the cards
  // look smaller when the whole board is in view. Keep FACTOR_MAX_R 100 less than it.
  AIM_RADIUS: 150,
  SURROUNDINGS_RADIUS: 800,
  // The two ends of the realm of influence scale, as distances of a factor's centre from the aim.
  // A factor can be dragged further out than FACTOR_MAX_R, until its centre is on the outer circle.
  FACTOR_MIN_R: 250,
  FACTOR_MAX_R: 700,
  // The width of a new card, and how narrow and how wide a card can be made by dragging its corner.
  ITEM_WIDTH: 200,
  ITEM_MIN_WIDTH: 140,
  ITEM_MAX_WIDTH: 400,

  FACTOR_KINDS: [
    { id: 'opportunity', label: 'Opportunity', description: 'Something that could help you reach your aim, if you make use of it.' },
    { id: 'barrier', label: 'Barrier', description: 'Something that stands in the way of your aim or slows it down.' },
    { id: 'influence', label: 'Influence', description: 'Something that shapes the situation. Often the reason behind a barrier or an opportunity.' }
  ],

  // Whether the toolbar shows Export, Open board file and New board. Hidden for now.
  FILE_BUTTONS: false,
  // The button that shows the demo board (js/demo.js) and, pressed again, goes back to the broker's own board.
  DEMO_BUTTON: 'Demo',

  // The kind a new factor has until the broker chooses another.
  DEFAULT_FACTOR_KIND: 'influence',

  // The questions in the factor editor.
  FACTOR_EDITOR: {
    kindQuestion: 'What\'s affecting your aim?',
    descriptionQuestion: 'Describe it',
    typeQuestion: 'What is it about?',
    // A place for anything more than the essentials. Kept with the factor but not shown on its card.
    notesQuestion: 'Additional notes',
    ownType: 'Something else',
    ownTypeHelp: 'Write your own',
    scaleQuestion: 'How much can you influence it?',
    // Asking why about a factor on the board: the button shown on hover, and the questions in the editor.
    whyButton: 'Why is that?',
    whyQuestion: 'Why is it like this?',
    whyPrompt: 'Name one thing that shapes it.',
    whyKindQuestion: 'What kind of factor is it?',
    // Asking what follows from a factor: the button shown under it on hover, and its question.
    nextButton: 'So what?',
    nextQuestion: 'What does this lead to?',
    nextPrompt: 'Name one thing that follows from it.'
  },

  // Suggested types, each with a short explanation. The broker can also write their own.
  // A short starting list; what brokers write under "Something else" shows what is missing.
  TYPES: [
    { name: 'People', description: 'A specific person, team or organisation' },
    { name: 'Culture', description: 'Shared values, habits and unwritten expectations' },
    { name: 'Rules', description: 'Written policies, contracts, regulations and laws' },
    { name: 'Structures', description: 'How work, roles and decisions are organised' },
    { name: 'Money', description: 'Budgets, costs and markets' },
    { name: 'Technology', description: 'Tools, systems and technical change' },
    { name: 'Wider trends', description: 'A direction society, politics or the environment is moving in' }
  ],

  // The choices shown when a connection is selected.
  CONNECTION_MENU: { none: 'Line', one: 'One way', both: 'Both ways', reverse: 'Reverse' },

  HORIZONS: [
    { id: 'now', label: 'Now' },
    { id: 'while', label: 'Takes a while' },
    { id: 'long', label: 'Long process' }
  ],

  SCALE_LOW: 'Easy to influence',
  SCALE_HIGH: 'Hard to influence',

  // Shown with their answers inside the Aim circle. The first answer is shown largest.
  // The ids are the names the answers are saved under; change the text freely but keep the ids.
  ASPIRATION_QUESTIONS: [
    { id: 'aim', text: 'In one sentence, what are you aiming to achieve?' },
    { id: 'change', text: 'What change do you want to bring about?' },
    { id: 'challenge', text: 'What do you want to challenge about how things are done today?' }
  ],

  // Shown in the Instructions panel, as numbered steps followed by short tips.
  INSTRUCTIONS: [
    'Write your aim. Double-click the Aim circle in the middle of the board and answer the three questions.',
    'Add barriers and opportunities. Click + Factor, choose Barrier or Opportunity, and describe what stands in the way of your aim or what could help it. Give it a type if one fits.',
    'Place each one by how much you can influence it. Set the Realm of influence scale and click Done, or drag the factor on the board afterwards. The darker area close to the aim means it is easy for you to influence. The lighter area towards the outer edge means it is hard.',
    'Ask why. Move the pointer over a barrier or an opportunity and click Why is that? above it. Describe what is behind it. The reason is added as an influence, with an arrow pointing to what it explains. So what? below it works the same way for what a barrier or an opportunity leads to.',
    'Add actions. Click + Action, describe something you can do, and choose how long it will take. Connect every action to at least one barrier, opportunity or influence.'
  ],
  // Always visible at the bottom of the board.
  BOARD_HINT: 'Double-click to edit',

  INSTRUCTIONS_TIPS: [
    'To connect two things, click one of them and drag from the black arrow on its right edge to the other.',
    'Click a connection to make it an arrow, one way or both ways, or to reverse it.',
    'To make a card wider or narrower, click it and drag the small square on its bottom right corner.',
    'Click something and press Delete to remove it.',
    'Click + Note, or double-click empty space, to add a note anywhere.',
    'Scroll to zoom. Drag empty space to move around.',
    'Undo with Ctrl+Z, or Cmd+Z on a Mac.'
  ]
};
