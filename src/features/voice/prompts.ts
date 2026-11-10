/*
 * The interview questions of "Record a memory" (roadmap F57, plan Task K9): 60 questions in 6 life stages,
 * in Vlo's own words. A question asks for a scene, so the answer has people, places and details.
 */

export interface PromptStage {
  stage: string;
  questions: readonly string[];
}

export const PROMPTS: readonly PromptStage[] = [
  {
    stage: 'Early childhood',
    questions: [
      'What is the first thing that you can remember?',
      'Describe the home where you lived as a small child. Walk through it room by room.',
      'Who looked after you when you were small, and what did they do for you each day?',
      'What did your home smell like on a holiday or a special day?',
      'Which toy or object did you love most, and what happened to it?',
      'Tell about a time when you were afraid as a child.',
      'What songs, stories or sayings did the adults around you repeat?',
      'Where did you play, and who played with you?',
      'Describe a meal that you remember from those years.',
      'What did you think that adults did all day?',
    ],
  },
  {
    stage: 'School years',
    questions: [
      'Describe your first day at a school.',
      'Which teacher do you remember best, and why?',
      'Who was your closest friend at school, and how did you meet?',
      'What did you do on the way to school and on the way home?',
      'Tell about a time when you got in trouble.',
      'Which subject or skill came easily to you, and which one did not?',
      'What did you do in the long holidays?',
      'Describe a game or a craze that everyone at school followed.',
      'Tell about a prize, a test or a performance that mattered to you.',
      'What did you want to be when you grew up?',
    ],
  },
  {
    stage: 'Growing up',
    questions: [
      'What music, books or films felt like yours as a teenager?',
      'Tell about the first time that you went somewhere without an adult.',
      'What did you argue about with your family?',
      'Describe the place where you and your friends spent time.',
      'Who was your first love, or your first crush?',
      'What was your first job, and what did you buy with the money?',
      'Tell about a time when you changed your mind about something important.',
      'What news or event from the wider world do you remember from those years?',
      'Which rule did you break, and what happened?',
      'What did you think your life would look like at 30?',
    ],
  },
  {
    stage: 'Starting out',
    questions: [
      'Tell about the day that you left home.',
      'Describe the first place that you lived on your own or with friends.',
      'What did you study or train for, and how did you choose it?',
      'Tell about a job interview or a first day at work.',
      'Who gave you advice in those years, and did you take it?',
      'Describe a journey that you took when you were young.',
      'What did you cook when you first lived on your own?',
      'Tell about a time when money was short.',
      'Which friend from those years do you think about now, and why?',
      'What was a risk that you took?',
    ],
  },
  {
    stage: 'Work and family',
    questions: [
      'How did you meet a person who became family to you?',
      'Describe a day at the work that you did longest.',
      'Tell about a celebration that you planned or remember well.',
      'What did you learn from a child, a parent or a partner?',
      'Describe a home that you made your own.',
      'Tell about a hard decision that you made for your family.',
      'What did you do on an ordinary weekend in those years?',
      'Tell about a time when someone helped you when you needed it.',
      'Which tradition did you keep, and which one did you start?',
      'What work are you proud of?',
    ],
  },
  {
    stage: 'Looking back',
    questions: [
      'Which day of your life would you like to live again?',
      'What do you know now that you wish that you knew at 20?',
      'Who changed the direction of your life?',
      'Tell about a loss and how you lived with it.',
      'What makes you laugh about your younger self?',
      'Which place do you think of as home, and why?',
      'What do you want your grandchildren, or a stranger, to know about your times?',
      'Tell about something that you made, kept or saved.',
      'What surprised you about getting older?',
      'If this memoir has one message, what is it?',
    ],
  },
];
