/** The app's time source. Tests replace `now` to move time. */
export const clock = {
  now(): number {
    return Date.now();
  },
};
