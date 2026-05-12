"use client";

import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  MotionValue,
} from "motion/react";
import { useState } from "react";

const backgroundCards = [
  {
    id: 1,
    image:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop",
    x: "10%",
    y: "12%",
    rotation: -12,
    scale: 1,
    opacity: 0.15,
    intensity: 0.02,
  },
  {
    id: 2,
    image:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop",
    x: "70%",
    y: "10%",
    rotation: 8,
    scale: 0.9,
    opacity: 0.2,
    intensity: 0.03,
  },
  {
    id: 3,
    image:
      "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=400&h=400&fit=crop",
    x: "30%",
    y: "40%",
    rotation: 15,
    scale: 1.1,
    opacity: 0.12,
    intensity: 0.04,
  },
  {
    id: 4,
    image:
      "https://images.unsplash.com/photo-1639149888905-fb39731f2e6c?w=400&h=400&fit=crop",
    x: "75%",
    y: "67%",
    rotation: -8,
    scale: 0.95,
    opacity: 0.18,
    intensity: 0.02,
  },
  {
    id: 5,
    image:
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop",
    x: "55%",
    y: "37%",
    rotation: -12,
    scale: 1,
    opacity: 0.1,
    intensity: 0.03,
  },
  {
    id: 6,
    image:
      "https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=400&h=400&fit=crop",
    x: "8%",
    y: "67%",
    rotation: -15,
    scale: 0.85,
    opacity: 0.15,
    intensity: 0.04,
  },
];

function BackgroundCard({
  card,
  smoothMouseX,
  smoothMouseY,
  index,
}: {
  card: (typeof backgroundCards)[0];
  smoothMouseX: MotionValue<number>;
  smoothMouseY: MotionValue<number>;
  index: number;
}) {
  const parallaxX = useTransform(
    smoothMouseX,
    [-1, 1],
    [-15 * card.intensity * 100, 15 * card.intensity * 100],
  );
  const parallaxY = useTransform(
    smoothMouseY,
    [-1, 1],
    [-10 * card.intensity * 100, 10 * card.intensity * 100],
  );

  return (
    <motion.div
      className="absolute"
      style={{
        left: card.x,
        top: card.y,
        x: parallaxX,
        y: parallaxY,
        rotate: card.rotation,
        scale: card.scale,
        opacity: card.opacity,
      }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: card.opacity, scale: card.scale }}
      transition={{ duration: 0.8, delay: index * 0.1 }}
    >
      <div className="w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 rounded-2xl overflow-hidden shadow-xl">
        <img
          src={card.image}
          alt=""
          className="w-full h-full object-cover"
          aria-hidden="true"
        />
      </div>
    </motion.div>
  );
}

export default function CTA1() {
  const [username, setUsername] = useState("");
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 50, stiffness: 100 };
  const smoothMouseX = useSpring(mouseX, springConfig);
  const smoothMouseY = useSpring(mouseY, springConfig);

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    mouseX.set(x);
    mouseY.set(y);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Username submitted:", username);
  };

  return (
    <section
      className="relative w-full min-h-screen flex items-center justify-center py-12 sm:py-16 md:py-20 lg:py-24 px-4 sm:px-6 lg:px-8 bg-white dark:bg-neutral-950 overflow-hidden"
      onMouseMove={handleMouseMove}
    >
      {/* Background Cards Layer */}
      <div className="absolute inset-0 pointer-events-none">
        {backgroundCards.map((card, index) => (
          <BackgroundCard
            key={card.id}
            card={card}
            smoothMouseX={smoothMouseX}
            smoothMouseY={smoothMouseY}
            index={index}
          />
        ))}
      </div>

      {/* Main Content */}
      <div className="relative z-10 max-w-[1400px] mx-auto w-full">
        <div className="max-w-4xl mx-auto text-center">
          {/* Heading */}
          <motion.h1
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.15] mb-4 sm:mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <span className="text-neutral-900 dark:text-white font-medium tracking-tight">
              Why settle for
            </span>
            <br />
            <span className="text-neutral-900 dark:text-white font-medium tracking-tight">
              algorithm chaos?
            </span>
          </motion.h1>

          {/* Description */}
          <motion.p
            className="text-base sm:text-lg md:text-xl text-neutral-600 dark:text-neutral-400 leading-relaxed mb-8 sm:mb-10 md:mb-12 max-w-xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            Join the platform where creators connect authentically. Build your
            community without the algorithm chaos.
          </motion.p>

          {/* Input Form */}
          <motion.form
            onSubmit={handleSubmit}
            className="max-w-lg mx-auto mb-6 sm:mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-0 sm:relative">
              {/* Input Container */}
              <div className="relative flex items-center bg-white dark:bg-neutral-900 rounded-full border border-neutral-300 dark:border-neutral-700 shadow-lg overflow-visible sm:overflow-hidden flex-1">
                {/* URL Prefix */}
                <div className="hidden sm:flex items-center pl-6 text-neutral-400 dark:text-neutral-500 text-base md:text-lg">
                  spark.social/
                </div>

                {/* Input Field */}
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="yourname"
                  className="flex-1 px-4 sm:px-0 py-4 bg-transparent text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 text-base md:text-lg outline-none"
                  aria-label="Enter your username"
                />
              </div>

              {/* Sign Up Button */}
              <button
                type="submit"
                className="cursor-pointer relative rounded-full bg-linear-to-r from-purple-500 via-pink-500 to-orange-500 font-medium text-sm sm:text-base hover:shadow-lg transition-all duration-200 whitespace-nowrap p-0.5 sm:absolute sm:right-1.5 sm:top-1/2 sm:-translate-y-1/2"
              >
                <span className="flex items-center justify-center w-full h-full rounded-full bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white px-6 py-2.5">
                  Claim Profile
                </span>
              </button>
            </div>
          </motion.form>

          {/* Login Link */}
          <motion.p
            className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            Already have an account?{" "}
            <a
              href="#"
              className="text-neutral-900 dark:text-white font-medium hover:underline transition-all duration-200"
            >
              Log in
            </a>
          </motion.p>
        </div>
      </div>
    </section>
  );
}
