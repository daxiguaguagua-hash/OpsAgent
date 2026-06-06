export interface DemoService {
  delay(milliseconds: number): Promise<void>;
}

export const demoService: DemoService = {
  delay(milliseconds) {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  },
};
