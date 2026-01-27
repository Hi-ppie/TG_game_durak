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
 * Calculates card positions for a circular layout where card bottoms are tangent to a circle.
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
    
    // Default values
    const radius = config.radius ?? 400;
    const cardHeight = config.cardHeight ?? 124;
    
    // Maximum spread angle (in degrees) - cards won't spread beyond this
    const maxSpreadAngle = 100;
    
    // Calculate actual spread based on number of cards
    // For few cards, use smaller spread; for many cards, use up to maxSpreadAngle
    const spreadAngle = Math.min(maxSpreadAngle, 15 * Math.max(0, cardCount - 1));
    
    // Starting angle (negative so cards spread symmetrically around bottom)
    const startAngle = -spreadAngle / 2;
    
    // Angular step between cards
    const angleStep = cardCount > 1 ? spreadAngle / (cardCount - 1) : 0;
    
    const positions: CardPosition[] = [];
    
    for (let i = 0; i < cardCount; i++) {
        // Calculate angle for this card (in degrees)
        const angleDeg = startAngle + i * angleStep;
        
        // Convert to radians
        const angleRad = (angleDeg * Math.PI) / 180;
        
        // Calculate position on the circle
        // The bottom edge of the card should touch the circle
        // So we need to position the card center at radius + cardHeight/2 from circle center
        const distanceFromCenter = radius + cardHeight / 2;
        
        // Calculate card center position
        // Angle 0 is at the bottom, positive angles go counterclockwise
        const cardCenterX = Math.sin(angleRad) * distanceFromCenter;
        const cardCenterY = -Math.cos(angleRad) * distanceFromCenter;
        
        // The card's position relative to the layout center
        const x = cardCenterX;
        const y = cardCenterY;
        
        // Rotation should match the tangent direction
        // The tangent at angle θ is perpendicular to the radius
        // So the card rotation equals the angle
        const rotation = angleDeg;
        
        // Z-index increases from left to right
        const zIndex = i;
        
        positions.push({ x, y, rotation, zIndex });
    }
    
    return positions;
}

/**
 * Calculates card positions for opponent's hand (mirrored layout)
 * 
 * @param cardCount - Number of cards to position
 * @param config - Layout configuration
 * @returns Array of card positions, one for each card
 */
export function calculateCircularCardLayoutMirrored(
    cardCount: number,
    config: CircularLayoutConfig
): CardPosition[] {
    const basePositions = calculateCircularCardLayout(cardCount, config);
    
    // Mirror the layout - flip vertically and reverse rotation
    return basePositions.map((pos, i) => ({
        x: -pos.x,  // Flip horizontally
        y: -pos.y,  // Flip vertically
        rotation: -pos.rotation,  // Reverse rotation
        zIndex: cardCount - i - 1,  // Reverse z-index for proper stacking
    }));
}
