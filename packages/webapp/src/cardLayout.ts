/**
 * Configuration for the circular card layout
 */
export interface CircularLayoutConfig {
    /**
     * Radius of the invisible circle (in pixels)
     * Default: 350
     */
    radius?: number;
    
    /**
     * Width of the screen/container (in pixels)
     * Used to calculate circle center
     */
    screenWidth: number;
    
    /**
     * Height of the screen/container (in pixels)
     * Used to calculate circle center
     */
    screenHeight: number;
    
    /**
     * Height of a single card (in pixels)
     * Default: 124
     */
    cardHeight?: number;
}

/**
 * Result of card position calculation
 */
export interface CardPosition {
    /**
     * Horizontal offset from center (in pixels)
     */
    x: number;
    
    /**
     * Vertical offset from center (in pixels)
     */
    y: number;
    
    /**
     * Rotation angle (in degrees)
     */
    rotation: number;
    
    /**
     * Z-index for stacking
     */
    zIndex: number;
}

/**
 * Helper function to calculate common layout parameters
 */
function getLayoutParams(cardCount: number, config: CircularLayoutConfig) {
    const radius = config.radius ?? 350;
    const cardHeight = config.cardHeight ?? 124;
    
    // Maximum spread angle (in degrees) - cards won't spread beyond this
    const maxSpreadAngle = 100;
    
    // Calculate actual spread based on number of cards
    // For few cards, use smaller spread; for many cards, use up to maxSpreadAngle
    const spreadAngle = Math.min(maxSpreadAngle, 15 * Math.max(0, cardCount - 1));
    
    // Starting angle (negative so cards spread symmetrically)
    const startAngle = -spreadAngle / 2;
    
    // Angular step between cards
    const angleStep = cardCount > 1 ? spreadAngle / (cardCount - 1) : 0;
    
    // Distance from circle center to card center
    const distanceFromCenter = radius + cardHeight / 2;
    
    return { startAngle, angleStep, distanceFromCenter };
}

/**
 * Calculates card positions for player's hand (bottom of screen).
 * Cards are positioned at the bottom of a circle, curving upward toward the player.
 * 
 * @param cardCount - Number of cards to position
 * @param config - Layout configuration
 * @returns Array of card positions, one for each card
 */
export function calculateCircularCardLayout(
    cardCount: number,
    config: CircularLayoutConfig
): CardPosition[] {
    if (cardCount === 0) {
        return [];
    }
    
    const { startAngle, angleStep, distanceFromCenter } = getLayoutParams(cardCount, config);
    const positions: CardPosition[] = [];
    
    for (let i = 0; i < cardCount; i++) {
        // Calculate angle for this card (in degrees)
        const angleDeg = startAngle + i * angleStep;
        
        // Convert to radians
        const angleRad = (angleDeg * Math.PI) / 180;
        
        // Calculate card center position
        // For player: circle center is ABOVE the cards (cards at bottom of circle)
        // Angle 0 is at the bottom, positive angles go counterclockwise
        const cardCenterX = Math.sin(angleRad) * distanceFromCenter;
        // Positive Y moves down, so we use positive value to place cards below circle center
        const cardCenterY = Math.cos(angleRad) * distanceFromCenter;
        
        // The card's position relative to the layout center
        const x = cardCenterX;
        const y = cardCenterY;
        
        // Rotation should match the tangent direction
        // For cards at bottom of circle curving upward, rotation = angle
        const rotation = angleDeg;
        
        // Z-index increases from left to right
        const zIndex = i;
        
        positions.push({ x, y, rotation, zIndex });
    }
    
    return positions;
}

/**
 * Calculates card positions for opponent's hand (top of screen).
 * Cards are positioned at the top of a circle, curving downward toward the opponent.
 * 
 * @param cardCount - Number of cards to position
 * @param config - Layout configuration
 * @returns Array of card positions, one for each card
 */
export function calculateCircularCardLayoutMirrored(
    cardCount: number,
    config: CircularLayoutConfig
): CardPosition[] {
    if (cardCount === 0) {
        return [];
    }
    
    const { startAngle, angleStep, distanceFromCenter } = getLayoutParams(cardCount, config);
    const positions: CardPosition[] = [];
    
    for (let i = 0; i < cardCount; i++) {
        // Calculate angle for this card (in degrees)
        const angleDeg = startAngle + i * angleStep;
        
        // Convert to radians
        const angleRad = (angleDeg * Math.PI) / 180;
        
        // Calculate card center position
        // For opponent: circle center is BELOW the cards (cards at top of circle)
        const cardCenterX = Math.sin(angleRad) * distanceFromCenter;
        // Negative Y to place cards above the circle center (toward top of screen)
        const cardCenterY = -Math.cos(angleRad) * distanceFromCenter;
        
        // The card's position relative to the layout center
        const x = cardCenterX;
        const y = cardCenterY;
        
        // Rotation for opponent: cards at top of circle curving downward
        // Need to flip the rotation by 180° so cards face downward
        const rotation = angleDeg + 180;
        
        // Z-index increases from left to right (same as player)
        const zIndex = i;
        
        positions.push({ x, y, rotation, zIndex });
    }
    
    return positions;
}
